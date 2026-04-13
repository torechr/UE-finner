const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const NACE = {
  lastebil: ["49.41", "49.42", "52.29", "43.12", "08.11", "08.12"],
  traktor:  ["01.61", "01.62", "01.11", "01.13", "01.41", "81.30"],
  graver:   ["43.12", "43.13", "42.11", "42.21", "41.20"],
};

// Kommune numbers for each location
const KOMMUNE_NR = {
  "arendal": ["4203"],
  "kristiansand": ["4204"],
  "grimstad": ["4202"],
  "bergen": ["4601"],
  "stavanger": ["1103"],
  "sandnes": ["1108"],
  "trondheim": ["5001"],
  "oslo": ["0301"],
  "drammen": ["3005"],
  "fredrikstad": ["3004"],
  "sarpsborg": ["3003"],
  "bodø": ["1804"],
  "tromsø": ["5401"],
  "ålesund": ["1507"],
  "molde": ["1506"],
  "hamar": ["3403"],
  "lillehammer": ["3405"],
  "gjøvik": ["3407"],
  "moss": ["3002"],
  "halden": ["3001"],
  "steinkjer": ["5006"],
  // Counties - list of kommune numbers
  "agder": ["4201","4202","4203","4204","4205","4206","4207","4208","4209","4210","4211","4212","4213","4214","4215","4216","4217","4218","4219","4220"],
  "vestland": ["4601","4602","4611","4612","4613","4614","4615","4616","4617","4618","4619","4620","4621","4622","4623","4624","4625","4626","4627","4628","4629","4630"],
  "rogaland": ["1101","1103","1106","1108","1111","1112","1114","1119","1120","1121","1122","1124","1127","1130","1133","1134","1135","1144","1145","1146"],
  "trøndelag": ["5001","5006","5007","5014","5020","5021","5022","5025","5026","5028","5029","5030","5031","5032","5033","5034","5035","5036","5037","5038"],
  "innlandet": ["3401","3403","3405","3407","3411","3412","3413","3414","3415","3416","3417","3418","3419","3420","3421","3422","3423","3424","3425","3426"],
  "nordland": ["1804","1806","1811","1812","1813","1815","1816","1818","1820","1822","1824","1825","1826","1827","1828","1832","1833","1834","1835","1836"],
  "viken": ["3001","3002","3003","3004","3005","3006","3007","3011","3012","3013","3014","3015","3016","3017","3018","3019","3020","3021","3022","3023"],
  "vestfold og telemark": ["3801","3802","3803","3804","3805","3806","3807","3808","3811","3812","3813","3814","3815","3816","3817","3818","3819","3820"],
  "troms og finnmark": ["5401","5402","5403","5404","5405","5406","5411","5412","5413","5414","5415","5416","5417","5418","5419","5420","5421","5422"],
  "møre og romsdal": ["1505","1506","1507","1511","1514","1515","1516","1517","1519","1520","1523","1524","1525","1526","1528","1531","1532","1535","1539"],
};

function getKommuneNr(location) {
  const key = location.toLowerCase().trim();
  return KOMMUNE_NR[key] || [];
}

async function brregSearchByKommune(kommuneNr, naceCodes) {
  const results = [];
  for (const nace of naceCodes) {
    try {
      const url = `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${nace}&kommunenummer=${kommuneNr}&size=50&konkurs=false&underAvvikling=false&organisasjonsform=AS,ENK,ANS,DA,SA,NUF,BA,STI,FLI`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data._embedded?.enheter) results.push(...data._embedded.enheter);
    } catch(e) {
      console.log("Brreg error:", e.message, nace, kommuneNr);
      continue;
    }
  }
  return results;
}

async function brregSearch(location, naceCodes) {
  const kommuneNrs = getKommuneNr(location);
  if (kommuneNrs.length === 0) return [];

  let allResults = [];
  // For counties, search top 3 municipalities; for single, search all
  const toSearch = kommuneNrs.length > 5 ? kommuneNrs.slice(0, 4) : kommuneNrs;

  for (const nr of toSearch) {
    const r = await brregSearchByKommune(nr, naceCodes);
    allResults.push(...r);
    if (allResults.length >= 15) break;
  }

  // Deduplicate
  const seen = new Set();
  return allResults.filter(e => {
    if (seen.has(e.organisasjonsnummer)) return false;
    seen.add(e.organisasjonsnummer);
    return true;
  });
}

async function checkBankruptcy(orgnr) {
  try {
    const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const d = await res.json();
    return !!(d.konkurs || d.underAvvikling || d.erSlettet);
  } catch { return false; }
}

function safeParseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch { return []; }
}

async function scoreCompanies(active, equipment, location) {
  if (active.length === 0) return [];
  try {
    const list = active.map(c => ({ orgnr: c.orgnr, navn: c.navn, nace: c.nace, ansatte: c.ansatte, stiftet: c.stiftet }));
    const prompt = "Score these Norwegian companies as subcontractors for " + equipment + " in " + location + ". Reply ONLY with JSON array: " + JSON.stringify(list) + " Format: [{\"orgnr\":\"123\",\"score\":7,\"anbefaling\":\"Anbefalt\",\"begrunnelse\":\"Short reason in Norwegian\",\"risikoer\":[]}] anbefaling: Anbefalt(7-10), Mulig(4-6), Lav prioritet(1-3).";
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    return safeParseJSON(text);
  } catch { return []; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { location, equipment } = req.body;
    if (!location || !equipment) return res.status(400).json({ error: "Mangler location eller equipment" });

    const naceCodes = NACE[equipment] || NACE.graver;
    const companies = await brregSearch(location, naceCodes);
    console.log("Brreg resultat:", companies.length, "for", location, equipment);

    if (companies.length === 0) {
      const eqDesc = { lastebil: "truck transport", traktor: "tractor agricultural machinery", graver: "excavator construction machinery" }[equipment] || equipment;
      const prompt = "Return a JSON array of 8 real Norwegian subcontractor companies for " + eqDesc + " in " + location + ". Output ONLY the JSON array. Format: [{\"navn\":\"Firma AS\",\"orgnr\":\"\",\"kommune\":\"" + location + "\",\"nace\":\"Transport\",\"ansatte\":5,\"stiftet\":\"2010\",\"score\":7,\"anbefaling\":\"Anbefalt\",\"begrunnelse\":\"Good company\",\"risikoer\":[]}]";
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
      const parsed = safeParseJSON(text);
      return res.json({ companies: parsed.sort((a, b) => (b.score || 0) - (a.score || 0)), source: "ai" });
    }

    const top = companies.slice(0, 25);
    const enriched = await Promise.all(top.map(async c => ({
      navn: c.navn, orgnr: c.organisasjonsnummer,
      kommune: c.forretningsadresse?.kommune || location,
      nace: c.naeringskode1?.beskrivelse || "",
      ansatte: c.antallAnsatte || 0,
      stiftet: c.stiftelsesdato ? c.stiftelsesdato.slice(0, 4) : "",
      organisasjonsform: c.organisasjonsform?.beskrivelse || "",
      konkurs: await checkBankruptcy(c.organisasjonsnummer),
    })));

    const active = enriched.filter(c => !c.konkurs);
    const bankrupt = enriched.filter(c => c.konkurs);
    const scores = await scoreCompanies(active, equipment, location);

    const final = active.map(c => {
      const ai = scores.find(s => s.orgnr === c.orgnr) || {};
      return { ...c, score: ai.score || 5, anbefaling: ai.anbefaling || "Mulig", begrunnelse: ai.begrunnelse || "", risikoer: ai.risikoer || [] };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));

    const bankruptFmt = bankrupt.map(c => ({
      ...c, score: 0, anbefaling: "Konkurs", begrunnelse: "Registrert konkursbo", risikoer: ["Konkurs registrert i Brreg"],
    }));

    res.json({ companies: [...final, ...bankruptFmt], source: "brreg", total: companies.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
