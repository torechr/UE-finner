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
  return results.filter(e => {
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
    const prompt = "Score these companies as subcontractors for " + equipment + " in " + location + ". Reply ONLY with a JSON array, no other text: " + JSON.stringify(companyList) + " Format: [{\"orgnr\":\"123\",\"score\":7,\"anbefaling\":\"Anbefalt\",\"begrunnelse\":\"Short reason\",\"risikoer\":[\"risk1\"]}] Use anbefaling: Anbefalt for score 7-10, Mulig for 4-6, Lav prioritet for 1-3.";
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
      const eqDesc = { lastebil: "truck transport", traktor: "tractor agricultural", graver: "excavator construction" }[equipment] || equipment;
      const prompt = "List 8 real Norwegian companies with " + eqDesc + " equipment in " + location + " that can be hired as subcontractors. Reply ONLY with JSON array: [{\"navn\":\"Company AS\",\"orgnr\":\"\",\"kommune\":\"" + location + "\",\"nace\":\"Transport\",\"ansatte\":5,\"stiftet\":\"2010\",\"score\":7,\"anbefaling\":\"Anbefalt\",\"begrunnelse\":\"Reason\",\"risikoer\":[]}]";
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
      ...c,
      score: 0,
      anbefaling: "Konkurs",
      begrunnelse: "Registrert konkursbo",
      risikoer: ["Konkurs registrert i Brreg"],
    }));

    res.json({ companies: [...final, ...bankruptFmt], source: "brreg", total: companies.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
