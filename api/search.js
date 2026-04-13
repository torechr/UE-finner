const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const NACE = {
  lastebil: ["49.41", "52.29"],
  traktor:  ["01.61", "01.62"],
  graver:   ["43.12", "43.13", "42.11"],
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

async function brregSearch(location, naceCodes) {
  const results = [];
  for (const nace of naceCodes) {
    try {
      const url = `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${nace}&kommunenavn=${encodeURIComponent(location)}&size=20&konkurs=false&underAvvikling=false`;
      const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (data._embedded?.enheter) results.push(...data._embedded.enheter);
    } catch { continue; }
  }
  const seen = new Set();
  return results.filter(e => { if (seen.has(e.organisasjonsnummer)) return false; seen.add(e.organisasjonsnummer); return true; });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { location, equipment } = req.body;
    if (!location || !equipment) return res.status(400).json({ error: "Mangler location eller equipment" });

    const naceCodes = NACE[equipment] || NACE.graver;
    let companies = await brregSearch(location, naceCodes);

    if (companies.length === 0) {
      const eqDesc = { lastebil:"lastebil tungtransport", traktor:"traktor maskinentreprenør", graver:"gravemaskin anleggsentreprenør" }[equipment];
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1200,
        messages: [{ role: "user", content: `Du er innkjøpsekspert for Mesta AS. List 8 reelle norske selskaper med ${eqDesc} i ${location}. Svar KUN med JSON-array:\n[{"navn":"","orgnr":"","kommune":"","nace":"","ansatte":0,"stiftet":"","score":7,"anbefaling":"Anbefalt","begrunnelse":"","risikoer":[]}]` }],
      });
      const text = msg.content.filter(b=>b.type==="text").map(b=>b.text).join("");
      const match = text.replace(/```json|```/g,"").match(/\[[\s\S]*\]/);
      return res.json({ companies: match?JSON.parse(match[0]).sort((a,b)=>(b.score||0)-(a.score||0)):[], source:"ai" });
    }

    const top = companies.slice(0, 12);
    const enriched = await Promise.all(top.map(async c => ({
      navn: c.navn, orgnr: c.organisasjonsnummer,
      kommune: c.forretningsadresse?.kommune || location,
      nace: c.naeringskode1?.beskrivelse || "",
      ansatte: c.antallAnsatte || 0,
      stiftet: c.stiftelsesdato ? c.stiftelsesdato.slice(0,4) : "",
      organisasjonsform: c.organisasjonsform?.beskrivelse || "",
      konkurs: await checkBankruptcy(c.organisasjonsnummer),
    })));

    const active = enriched.filter(c => !c.konkurs);
    const bankrupt = enriched.filter(c => c.konkurs);

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 1200,
      messages: [{ role: "user", content: `Du er innkjøpsekspert for Mesta AS. Vurder disse selskapene som potensielle underentreprenører for ${equipment} i ${location}:\n${JSON.stringify(active.map(c=>({navn:c.navn,orgnr:c.orgnr,nace:c.nace,ansatte:c.ansatte,stiftet:c.stiftet})))}\n\nSvar KUN med JSON-array:\n[{"orgnr":"","score":7,"anbefaling":"Anbefalt","begrunnelse":"1 setning","risikoer":[]}]\n\nAnbefaling: "Anbefalt"(7-10), "Mulig"(4-6), "Lav prioritet"(1-3).` }],
    });

    const text = msg.content.filter(b=>b.type==="text").map(b=>b.text).join("");
    const match = text.replace(/```json|```/g,"").match(/\[[\s\S]*\]/);
    const scores = match ? JSON.parse(match[0]) : [];

    const final = active.map(c => {
      const ai = scores.find(s=>s.orgnr===c.orgnr)||{};
      return { ...c, score:ai.score||5, anbefaling:ai.anbefaling||"Mulig", begrunnelse:ai.begrunnelse||"", risikoer:ai.risikoer||[] };
    }).sort((a,b)=>(b.score||0)-(a.score||0));

    const bankruptFmt = bankrupt.map(c=>({...c, score:0, anbefaling:"Konkurs", begrunnelse:"Registrert konkursbo – ikke aktuell", risikoer:["Konkurs registrert i Brreg"]}));

    res.json({ companies: [...final, ...bankruptFmt], source:"brreg", total:companies.length });
  } catch(e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
