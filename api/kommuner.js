module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const response = await fetch("https://data.brreg.no/enhetsregisteret/api/kommuner", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Brreg kommuner feilet");
    const data = await response.json();
    // Returns list of {nummer, navn}
    const kommuner = (data._embedded?.kommuner || [])
      .map(k => ({ nummer: k.nummer, navn: k.navn }))
      .sort((a, b) => a.navn.localeCompare(b.navn, "no"));
    res.json({ kommuner });
  } catch (e) {
    // Fallback to hardcoded list if API fails
    res.status(500).json({ error: e.message });
  }
};
