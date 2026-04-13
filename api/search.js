const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const NACE = {
  lastebil: ["49.41", "49.42", "52.29", "52.21", "49.39"],
  traktor:  ["01.61", "01.62", "01.63", "43.12", "81.30", "01.41"],
  graver:   ["43.12", "43.13", "42.11", "42.21", "41.20", "43.99", "43.11"],
};

const COUNTIES = ["agder","innlandet","møre og romsdal","nordland","oslo","rogaland","troms og finnmark","trøndelag","vestfold og telemark","vestland","viken"];

const COUNTY_MUNICIPALITIES = {
  "agder": ["ARENDAL","KRISTIANSAND","GRIMSTAD","LILLESAND","FARSUND","FLEKKEFJORD","LYNGDAL","MANDAL","LINDESNES","RISØR","TVEDESTRAND","VEGÅRSHEI","GJERSTAD","IVELAND","EVJE OG HORNNES","BYGLAND","VALLE","BYKLE","ÅSERAL","HÆGEBOSTAD"],
  "vestland": ["BERGEN","ALVER","ASKØY","BJØRNAFJORDEN","BØMLO","EIDFJORD","ETNE","FEDJE","FITJAR","FJORD","GULEN","HØYANGER","KINN","KVAM","KVINNHERAD","LUSTER","LÆRDAL","MODALEN","OSTERØY","SAMNANGER","SOGNDAL","SOLUND","STAD","STORD","STRYN","SUNNFJORD","SVEIO","TYSNES","ULLENSVANG","ULVIK","VIK","VOSS","ØYGARDEN","ÅRDAL"],
  "rogaland": ["STAVANGER","SANDNES","HAUGESUND","EGERSUND","BRYNE","KLEPP","TIME","HÅ","SOLA","RANDABERG","RENNESØY","FINNØY","HJELMELAND","SAUDA","VINDAFJORD","ETNE","TYSVÆR","KARMØY","BOKN","KVITSØY","BJERKREIM","LUND","SOKNDAL","EIGERSUND"],
  "trøndelag": ["TRONDHEIM","STEINKJER","NAMSOS","STJØRDAL","LEVANGER","VERDAL","MELHUS","SKAUN","MALVIK","MIDTRE GAULDAL","SELBU","TYDAL","MERÅKER","FROSTA","INDERØY","SNÅSA","LIERNE","RØYRVIK","NAMSSKOGAN","GRONG","HØYLANDET","OVERHALLA","FOSNES","NÆRØYSUND","LEKA","BINDAL","VIKNA","FLATANGER"],
  "innlandet": ["HAMAR","LILLEHAMMER","GJØVIK","RINGSAKER","STANGE","LØTEN","HEDMARKEN","KONGSVINGER","ELVERUM","ÅMOT","STOR-ELVDAL","RENDALEN","ENGERDAL","TRYSIL","ÅSNES","GRUE","VÅLER","NORSK","TOLGA","OS","FOLLDAL","ALVDAL","TYNSET","DOVRE","LESJA","SKJÅK","LOM","VÅGÅ","SEL","NORD-FRON","SØR-FRON","RINGEBU","ØYER","GAUSDAL","GRAN","LUNNER","JEVNAKER","ØSTRE TOTEN","VESTRE TOTEN","SØNDRE LAND","NORDRE LAND","SØR-AURDAL","ETNEDAL","NORD-AURDAL","VESTRE SLIDRE","ØYSTRE SLIDRE","VÅGÅ"],
};

async function checkBankruptcy(orgnr) {
  try {
    const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const d = await res.json();
    return !!(d.konkurs || d.underAvvikling || d.erSlettet);
  } catch { return false; }
}

async function brregSearchByMunicipality(municipality, naceCodes) {
  const results = [];
  for (const nace of naceCodes) {
    try {
      const url = `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${nace}&kommunenavn=${encodeURIComponent(municipality)}&size=20&konkurs=false&underAvvikling=false`;
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data._embedded?.enheter) results.push(...data._embedded.enheter);
    } catch { continue; }
  }
  return results;
}

async function brregSearch(location, naceCodes) {
  const locLower = location.toLowerCase().trim();
  const isCounty = COUNTIES.includes(locLower);

  let allResults = [];

  if (isCounty) {
    // Search top municipalities in county
    const municipalities = COUNTY_MUNICIPALITIES[locLower] || [];
    const topMunicipalities = municipalities.slice(0, 5);
    for (const muni of topMunicipalities) {
      const r = await brregSearchByMunicipality(muni, naceCodes);
      allResults.push(...r);
      if (allResults.length >= 15) break;
    }
  } else {
    // Direct municipality search - try both original and uppercase
    allResults = await brregSearchByMunicipality(location.toUpperCase(), naceCodes);
    if (allResults.length === 0) {
      allResults = await brregSearchByMunicipality(location, naceCodes);
    }
  }

  // Deduplicate
  const seen = new Set();
  return allResults.filter(e => {
    if (seen.has(e.organisasjonsnummer)) return false;
    seen.add(e.organisasjonsnummer);
    return true;
  });
}

function safeParseJSON(text) {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) return [];
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

async function scoreCompanies(active, equipment, location) {
  if (active.length === 0) return [];
  try {
    const companyList = active.map(c => ({
      orgnr: c.orgnr,
      navn: c.navn,
      nace: c.nace,
      ansatte: c.ansatte,
      stiftet: c.stiftet
    }));
    const prompt = "Score these Norwegian companies as subcontractors for " + equipment + " in " + location + ". Reply ONLY with JSON array: " + JSON.stringify(companyList) + " Format: [{\"orgnr\":\"123\",\"score\":7,\"anbefaling\":\"Anbefalt\",\"begrunnelse\":\"Short reason in Norwegian\",\"risikoer\":[\"risk\"]}] anbefaling values: Anbefalt(7-10), Mulig(4-6), Lav prioritet(1-3).";
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    return safeParseJSON(text);
  } catch {
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { location, equipment } = req.body;
    if (!location || !equipment) return res.status(400).json({ error: "Mangler location eller equipment" });

    const naceCodes = NACE[equipment] || NACE.graver;
    let companies = await brregSearch(location, naceCodes);

    if (companies.length === 0) {
      // AI fallback
      const eqDesc = { lastebil: "truck transport", traktor: "tractor agricultural machinery", graver: "excavator construction machinery" }[equipment] || equipment;
      const prompt = "Return a JSON array of 8 Norwegian subcontractor companies for " + eqDesc + " in " + location + ". Output ONLY the JSON array, nothing else, no explanation. Example format: [{\"navn\":\"Firma AS\",\"orgnr\":\"912345678\",\"kommune\":\"" + location + "\",\"nace\":\"Maskinentreprenor\",\"ansatte\":5,\"stiftet\":\"2010\",\"score\":7,\"anbefaling\":\"Anbefalt\",\"begrunnelse\":\"Good local company\",\"risikoer\":[]}]";
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
      const parsed = safeParseJSON(text);
      return res.json({ companies: parsed.sort((a, b) => (b.score || 0) - (a.score || 0)), source: "ai" });
    }

    const top = companies.slice(0, 12);
    const enriched = await Promise.all(top.map(async c => ({
      navn: c.navn,
      orgnr: c.organisasjonsnummer,
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
      return {
        ...c,
        score: ai.score || 5,
        anbefaling: ai.anbefaling || "Mulig",
        begrunnelse: ai.begrunnelse || "",
        risikoer: ai.risikoer || [],
      };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));

    const bankruptFmt = bankrupt.map(c => ({
      ...c, score: 0, anbefaling: "Konkurs",
      begrunnelse: "Registrert konkursbo", risikoer: ["Konkurs registrert i Brreg"],
    }));

    res.json({ companies: [...final, ...bankruptFmt], source: "brreg", total: companies.length, debug: { brregCount: companies.length, activeCount: active.length, location, naceCodes } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
