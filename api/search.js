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
      const eqDesc = { lastebil:"lastebil tungtransport", traktor:"traktor maskinentreprenør", graver:"gravemaskin anleggsentreprenør" }[equipment]
