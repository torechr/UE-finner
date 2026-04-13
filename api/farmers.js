const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const MUNICIPALITY_CODES = {
  "arendal":["4203"],"kristiansand":["4204"],"bergen":["4601"],"stavanger":["1103"],
  "trondheim":["5001"],"oslo":["0301"],"drammen":["3005"],"fredrikstad":["3004"],
  "sarpsborg":["3003"],"sandnes":["1108"],"bodø":["1804"],"tromsø":["5401"],
  "ålesund":["1507"],"hamar":["3403"],"moss":["3002"],"gjøvik":["3407"],
  "lillehammer":["3405"],"halden":["3001"],"molde":["1506"],"steinkjer":["5006"],
  "agder":["4201","4202","4203","4204","4205","4206","4207","4208","4209","4210","4211","4212","4213","4214","4215","4216","4217","4218","4219","4220"],
  "vestland":["4601","4602","4611","4612","4613","4614","4615","4616","4617","4618","4619","4620","4621","4622","4623","4624","4625","4626","4627","4628"],
  "rogaland":["1101","1103","1106","1108","1111","1112","1114","1119","1120","1121","1122","1124","1127","1130","1133","1134","1135","1144","1145","1146"],
  "trøndelag":["5001","5006","5007","5014","5020","5021","5022","5025","5026","5027","5028","5029","5030","5031","5032","5033","5034","5035","5036","5037"],
  "innlandet":["3401","3403","3405","3407","3411","3412","3413","3414","3415","3416","3417","3418","3419","3420","3421","3422","3423","3424","3425","3426"],
  "nordland":["1804","1806","1811","1812","1813","1815","1816","1818","1820","1822","1824","1825","1826","1827","1828","1832","1833","1834","1835","1836"],
  "viken":["3001","3002","3003","3004","3005","3006","3007","3011","3012","3013","3014","3015","3016","3017","3018","3019","3020","3021","3022","3023"],
  "møre og romsdal":["1505","1506","1507","1511","1514","1515","1516","1517","1519","1520","1523","1524","1525","1526","1528","1531","1532","1535","1539"],
  "vestfold og telemark":["3801","3802","3803","3804","3805","3806","3807","3808","3811","3812","3813","3814","3815","3816","3817","3818","3819","3820"],
  "troms og finnmark":["5401","5402","5403","5404","5405","5406","5411","5412","5413","5414","5415","5416","5417","5418","5419","5420","5421","5422"],
};

function findCodes(location) {
  const key = location.toLowerCase().trim();
  if (MUNICIPALITY_CODES[key]) return MUNICIPALITY_CODES[key];
  for (const [k,v] of Object.entries(MUNICIPALITY_CODES)) {
    if (k.includes(key)||key.includes(k)) return v;
  }
  return [];
}

async function enrichFromBrreg(orgnr) {
  try {
    const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (d.konkurs||d.underAvvikling||d.erSlettet) return null;
    return { orgnr, navn:d.navn||"", kommune:d.forretningsadresse?.kommune||"", nace:d.naeringskode1?.beskrivelse||"", ansatte:d.antallAnsatte||0, stiftet:d.stiftelsesdato?d.stiftelsesdato.slice(0,4):"", organisasjonsform:d.organisasjonsform?.beskrivelse||"" };
  } catch { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { location } = req.body;
    if (!location) return res.status(400).json({ error: "Mangler location" });

    const komnrList = findCodes(location);
    if (komnrList.length === 0) return res.json({ farmers:[], message:`Ingen kommunekoder for "${location}"` });

    const csvRes = await fetch("https://raw.githubusercontent.com/LandbruksdirektoratetGIT/opendata/refs/heads/main/datasets/foretak/dataset.csv", { signal: AbortSignal.timeout(15000) });
    if (!csvRes.ok) throw new Error("Kunne ikke hente Landbruksregisteret");
    const csv = await csvRes.text();

    const lines = csv.split("\n").slice(1);
    const matching = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.replace(/"/g,"").split(";");
      if (parts.length >= 2 && komnrList.includes(parts[1]?.trim()) && parts[0]?.trim()) {
        matching.push(parts[0].trim());
      }
    }

    if (matching.length === 0) return res.json({ farmers:[], total:0, message:"Ingen landbruksforetak funnet" });

    const sample = matching.sort(()=>Math.random()-0.5).slice(0,20);
    const enriched = [];
    for (let i=0; i<sample.length; i+=5) {
      const batch = sample.slice(i,i+5);
      const results = await Promise.all(batch.map(enrichFromBrreg));
      results.forEach(r=>{ if(r) enriched.push(r); });
    }

    if (enriched.length === 0) return res.json({ farmers:[], total:matching.length, message:"Ingen aktive foretak funnet" });

    const msg = await client.messages.create({
      model:"claude-sonnet-4-6", max_tokens:1000,
      messages:[{ role:"user", content:`Du er innkjøpsekspert for Mesta AS. Disse er landbruksforetak i ${location} – vurder hvem Mesta kan kontakte for traktortjenester:\n${JSON.stringify(enriched.map(c=>({navn:c.navn,orgnr:c.orgnr,nace:c.nace,ansatte:c.ansatte,form:c.organisasjonsform})))}\n\nSvar KUN med JSON-array:\n[{"orgnr":"","score":7,"anbefaling":"Anbefalt","begrunnelse":"1 setning","risikoer":[],"tjenester":["traktor"]}]` }],
    });

    const text = msg.content.filter(b=>b.type==="text").map(b=>b.text).join("");
    const match = text.replace(/```json|```/g,"").match(/\[[\s\S]*\]/);
    const scores = match?JSON.parse(match[0]):[];

    const final = enriched.map(c=>{
      const ai=scores.find(s=>s.orgnr===c.orgnr)||{};
      return {...c, score:ai.score||5, anbefaling:ai.anbefaling||"Mulig", begrunnelse:ai.begrunnelse||"", risikoer:ai.risikoer||[], tjenester:ai.tjenester||["traktor"]};
    }).sort((a,b)=>(b.score||0)-(a.score||0));

    res.json({ farmers:final, total:matching.length, sampled:enriched.length });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
