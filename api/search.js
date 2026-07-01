const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

// NB: Brreg sitt API krever eksakt match pa naeringskode (ikke prefiks-sok).
// Alle koder ma vaere fullstendige 5-sifrede SN2007-koder inkl. trailing null,
// f.eks. "81.290" og ikke "81.29" — ellers returnerer Brreg 0 treff for den koden.
const NACE = {
  vinter:         ["81.290", "49.410", "43.110", "43.120", "43.130", "43.190", "01.610"],
  vinterlastebil: ["81.290", "49.410", "49.420", "52.290", "43.110", "43.120", "43.130", "43.190"],
  vintertraktor:  ["81.290", "01.610", "01.620", "01.410", "01.450", "81.300", "43.110", "43.120", "43.130", "43.190"],
  trafikk:        ["80.100", "52.210", "74.900", "43.990"],
  renhold:        ["81.290", "81.210", "37.000", "38.110"],
  naturlike:      ["81.300", "02.100", "02.400", "01.610", "43.110", "43.120", "43.130", "43.190"],
  parklike:       ["81.300", "01.190", "01.130", "02.100", "02.400"],
  graving:        ["43.110", "43.120", "43.130", "43.190", "42.110", "42.210", "41.200", "43.990"],
  pukkverk:       ["08.110", "08.120", "08.910", "23.700"],
};

const KEYWORDS = {
  vinter:         ["broyting", "vinterdrift", "snorydding", "salting", "stroing", "brøyting", "snørydding", "strøing"],
  vinterlastebil: ["brøyting", "broyting", "lastebil", "vinterdrift", "salting", "transport"],
  vintertraktor:  ["brøyting", "broyting", "traktor", "vinterdrift", "snørydding", "snorydding"],
  trafikk:        ["trafikkdirigering", "arbeidsvarsling", "trafikkvakt", "dirigering", "vakthold", "trafikk"],
  renhold:        ["feiing", "spyling", "renhold", "veirenhold", "tunnelrenhold", "rengjoring", "rengjøring"],
  naturlike:      ["kantklipp", "vegetasjon", "skoging", "skogrydding", "skogsdrift", "hogst", "grasklipper", "arborist", "trepleie", "trefelling"],
  parklike:       ["gartner", "plenklipp", "park", "hageservice", "landskapspleie", "gressklipper", "blomster", "arborist", "trepleie", "beskjaering"],
  graving:        ["gravemaskin", "graving", "hjulgraver", "beltegraver", "minigraver", "maskinentreprenor", "maskinentreprenør", "anleggsmaskin"],
  pukkverk:       ["pukkverk", "steinbrudd", "grustak", "pukk", "grus", "knust", "singel", "tilslag", "steinknusing", "stein", "hellebrudd", "fjellbrudd", "knusing"],
};

// Keywords searched in purpose/formaal text (broader reach than name search)
const PURPOSE_KEYWORDS = {
  vinter:         ["broeyting", "vinterdrift", "salting"],
  vinterlastebil: ["broeyting", "vinterdrift", "salting", "nlf", "vinterdrift"],
  vintertraktor:  ["broeyting", "vinterdrift", "snorydding"],
  trafikk:        ["trafikkdirigering", "arbeidsvarsling"],
  renhold:        ["feiing", "spyling", "veisop"],
  naturlike:      ["kantklipp", "skoging", "skogrydding", "trefelling"],
  parklike:       ["arborist", "trepleie", "plenklipp"],
  graving:        ["graving", "maskinentreprenor", "hjulgraver", "mef"],
  pukkverk:       ["pukkverk", "steinbrudd", "grustak", "knusing"],
};

// Kommunenummer-oppslag: henter alltid live fra Brreg for eksakt match.
// Vi cacher resultater i minnet (kommuneCache) for a unnga gjentatte kall
// i same request. Ingen hardkoding — fungerer automatisk for alle kommuner
// inkl. fremtidige reformer.
const kommuneCache = new Map();

// Kjente fylkesnummer for rask oppslag uten API-kall
const FYLKE_NR = {
  "agder":["4201","4202","4203","4204","4205","4206","4207","4208","4209","4210","4211","4212","4213","4214","4215","4216","4217","4218","4219","4220","4221","4222","4223","4224"],
  "akershus":["3201","3203","3205","3207","3209","3211","3213","3215","3217","3219","3221","3223","3225","3227","3229"],
  "buskerud":["3301","3303","3305","3310","3312","3314","3316","3318","3320","3322","3324","3326","3328","3330","3332","3334","3336","3338"],
  "finnmark":["5601","5603","5605","5607","5610","5612","5614","5616","5618","5620","5622","5624","5626","5628","5630","5632","5634","5636"],
  "innlandet":["3401","3403","3405","3407","3409","3411","3413","3415","3417","3419","3421","3423","3425","3427","3429","3431","3433","3435","3437","3439","3441","3443","3445","3447","3449","3451","3453","3455","3457","3459","3461","3463","3465","3467","3469","3471","3473","3475","3477","3479","3481","3483"],
  "møre og romsdal":["1505","1506","1508","1511","1514","1515","1516","1517","1520","1525","1528","1531","1532","1535","1539","1547","1554","1557","1560","1563","1566","1573","1576","1577","1578","1580"],
  "nordland":["1804","1806","1811","1812","1813","1815","1816","1818","1820","1822","1824","1825","1826","1827","1828","1832","1833","1834","1835","1836","1837","1838","1839","1840","1841","1845","1848","1851","1853","1856","1857","1859","1860","1865","1866","1867","1868"],
  "oslo":["0301"],
  "rogaland":["1101","1103","1108","1111","1112","1114","1119","1120","1121","1122","1124","1127","1130","1133","1144","1145","1146","1149","1151","1160"],
  "telemark":["4001","4003","4005","4010","4012","4014","4016","4018","4020","4022","4024","4026","4028","4030","4032","4034","4036"],
  "troms":["5501","5503","5510","5512","5514","5516","5518","5520","5522","5524","5526","5528","5530","5532","5534","5536","5538","5540","5542","5544","5546"],
  "trøndelag":["5001","5006","5007","5014","5020","5021","5025","5027","5028","5029","5030","5031","5032","5033","5034","5036","5037","5038","5041","5042","5043","5044","5045","5046","5047","5049","5052","5053","5054","5055","5056","5057","5058","5059","5060","5061"],
  "vestfold":["3901","3903","3905","3907","3909"],
  "vestland":["4601","4611","4612","4613","4614","4615","4616","4617","4618","4619","4620","4621","4622","4623","4624","4625","4626","4627","4628","4629","4630","4631","4632","4633","4634","4635","4636","4637","4638","4639","4640","4641","4642","4643","4644","4645","4646","4647","4648","4649","4650","4651"],
  "østfold":["3101","3103","3105","3107","3110","3112","3114","3116","3118","3120","3122","3124"],
};

async function getKommuneNr(location) {
  const key = location.toLowerCase().trim();

  // Sjekk fylkesliste foerst (rask, ingen API-kall)
  if (FYLKE_NR[key]) return FYLKE_NR[key];

  // Sjekk cache
  if (kommuneCache.has(key)) return kommuneCache.get(key);

  // Dynamisk oppslag mot Brreg — fungerer for alle norske kommuner
  // inkl. de som mangler i hardkodede lister
  try {
    const data = await brregFetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter?organisasjonsform=KOMM&navn=${encodeURIComponent(key)}&size=5`
    );
    const enheter = data?._embedded?.enheter || [];
    // Finn eksakt eller nær match pa kommunenavn
    const match = enheter.find(e => {
      const navn = e.navn?.replace(/ KOMMUNE$/i,"").replace(/ kommune$/i,"").toLowerCase().trim();
      return navn === key || navn.startsWith(key);
    });
    if (match?.forretningsadresse?.kommunenummer) {
      const nr = [match.forretningsadresse.kommunenummer];
      kommuneCache.set(key, nr);
      return nr;
    }
    // Fallback: foerste treff
    const first = enheter[0]?.forretningsadresse?.kommunenummer;
    if (first) {
      const nr = [first];
      kommuneCache.set(key, nr);
      return nr;
    }
  } catch(e) {
    console.error(`getKommuneNr feil for "${key}": ${e.message}`);
  }

  kommuneCache.set(key, []);
  return [];
}

async function brregFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      // Logg faktisk status + feilmelding fra Brreg i stedet for a svelge feilen stille.
      // Brreg returnerer detaljert valideringsfeil-JSON pa 400-responser.
      let detail = "";
      try { detail = await res.text(); } catch {}
      console.error(`Brreg ${res.status} for url=${url} :: ${detail.slice(0, 500)}`);
      return null;
    }
    return res.json();
  } catch (e) {
    console.error(`Brreg fetch-feil for url=${url} :: ${e.message}`);
    return null;
  }
}

async function brregSearchByKommune(kommuneNr, naceCodes, keywords, purposeKeywords) {
  // Ett samlet kall med kommaseparert naeringskode-liste, slik Brreg sitt API faktisk forventer
  // (eksempel fra dokumentasjonen: naeringskode=41.109,01.1). Tidligere ble det sendt ett
  // kall PER kode, noe som i kombinasjon med den lange organisasjonsform-listen kunne gi 400.
  // Brreg sorterer alfabetisk og har maks 100 per side.
  // Vi henter inntil 3 sider (300 treff) for aa fange alle relevante selskaper
  // uavhengig av hvor de havner alfabetisk (f.eks. "PER TRY AS" pa side 2).
  // Hent side 0 foerst for aa faa totalElements, start deretter resten parallelt
  async function fetchNacePages() {
    if (naceCodes.length === 0) return [];
    const baseUrl = `https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${naceCodes.join(",")}&kommunenummer=${kommuneNr}&size=100&konkurs=false&underAvvikling=false&organisasjonsform=AS,ENK,ANS,DA,SA,NUF,BA,STI,FLI`;
    const page0 = await brregFetch(`${baseUrl}&page=0`).catch(() => null);
    const page0results = page0?._embedded?.enheter || [];
    const total = page0?.page?.totalElements || 0;
    // Hent eventuelle ekstra sider parallelt
    const extraPages = [];
    if (total > 100) extraPages.push(brregFetch(`${baseUrl}&page=1`).catch(() => null));
    if (total > 200) extraPages.push(brregFetch(`${baseUrl}&page=2`).catch(() => null));
    const extra = await Promise.all(extraPages);
    return [...page0results, ...extra.flatMap(p => p?._embedded?.enheter || [])];
  }

  // Hopp over keyword-sok hvis NACE allerede gir nok treff (spar mange API-kall)
  const naceResults = await fetchNacePages();
  const skipKeywords = naceResults.length >= 80;
  const keywordPromises = skipKeywords ? [] : (keywords || []).map(kw =>
    brregFetch(`https://data.brreg.no/enhetsregisteret/api/enheter?navn=${encodeURIComponent(kw)}&kommunenummer=${kommuneNr}&size=20&konkurs=false&underAvvikling=false&organisasjonsform=AS,ENK,ANS,DA,SA,NUF,BA,STI,FLI`)
      .then(data => data?._embedded?.enheter || [])
      .catch(() => [])
  );
  const keywordResults = await Promise.all(keywordPromises);
  return [...naceResults, ...keywordResults.flat()];
}

async function brregSearch(location, naceCodes, keywords, purposeKeywords, complete=false) {
  const kommuneNrs = await getKommuneNr(location);
  if (kommuneNrs.length === 0) return [];

  const isCounty = kommuneNrs.length > 5;
  // complete=true fetches all municipalities in county, otherwise top 5
  const toSearch = isCounty && !complete ? kommuneNrs.slice(0, 5) : kommuneNrs;

  const allResults = (await Promise.all(
    toSearch.map(nr => brregSearchByKommune(nr, naceCodes, keywords, purposeKeywords))
  )).flat();

  // Deduplicate
  const seen = new Set();
  return allResults.filter(e => {
    if (seen.has(e.organisasjonsnummer)) return false;
    seen.add(e.organisasjonsnummer);
    return true;
  });
}

async function fetchDagligLeder(orgnr) {
  try {
    const data = await brregFetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}/roller`);
    if (!data) return "";
    const gruppe = (data.rollegrupper || []).find(g => g.type?.kode === "DAGL");
    const person = gruppe?.roller?.[0]?.person;
    if (!person) return "";
    return [person.navn?.fornavn, person.navn?.etternavn].filter(Boolean).join(" ");
  } catch { return ""; }
}

async function checkBankruptcy(orgnr) {
  try {
    const data = await brregFetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${orgnr}`);
    if (!data) return false;
    return !!(data.konkurs || data.underAvvikling || data.erSlettet);
  } catch { return false; }
}

function safeParseJSON(text) {
  try {
    const match = text.replace(/```json|```/g, "").trim().match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch { return []; }
}

async function scoreCompanies(companies, equipment, location) {
  if (companies.length === 0) return [];
  try {
    const list = companies
      .sort((a, b) => (b.ansatte || 0) - (a.ansatte || 0))
      .slice(0, 15)
      .map(c => ({ orgnr: c.orgnr, navn: c.navn, nace: c.nace, ansatte: c.ansatte, stiftet: c.stiftet }));

    const categoryContext = {
      vinter:         "broyting/salting/stroing av veg med lastebil eller traktor. Krever erfaring med vinterdrift pa offentlig veg.",
      vinterlastebil: "broytebil/saltbil pa offentlig veg. Lastebil med plog og saltspreder er kjernen.",
      vintertraktor:  "traktor med frontplog og sandspreder, typisk for gang/sykkelveg og mindre veier.",
      trafikk:        "trafikkdirigering og arbeidsvarsling ved vegarbeid. Krever kurs N301 og godkjente dirigenter.",
      renhold:        "feiing og spyling av vegbane og tunneler. Spesialutstyr som feiemaskin og spylebil.",
      naturlike:      "kantklipp, skoging og vegetasjonsrydding langs veg. Traktor med kantklipperutstyr eller motorsag.",
      parklike:       "plenklipp, gartnertjenester og trepleie i vegomgivelser. Gjerne godkjent arborist for trearbeid.",
      graving:        "graving og maskinentreprenortjenester. Hjulgraver, beltegraver eller minigraver etter oppdragsstorrelse.",
      pukkverk:       "levering av pukk, grus og steinmaterialer til vegformål. Knust fjell, naturlig grus, singel og tilslagsmaterialer i ulike fraksjoner.",
    }[equipment] || equipment;

    const prompt = `Du er innkjopsekspert for Mesta AS, Norges ledende vegentreprenor. Mesta utforer drift og vedlikehold av riks- og fylkesveger pa vegne av Statens vegvesen og fylkeskommuner.

Vurder disse selskapene som potensielle underentreprenorer (UE) for oppgaven: ${categoryContext} i ${location}.

Mestas krav til UE-er:
- Dokumentert erfaring med tilsvarende oppdrag
- Tilstrekkelig kapasitet (utstyr og personell) for vegdriftsoppdrag
- Stabil drift (ikke nystartet, ikke for sma)
- God lokalkunnskap i oppdrags omradet

Selskaper: ${JSON.stringify(list)}

Svar KUN med JSON-array:
[{"orgnr":"123","score":7,"anbefaling":"Anbefalt","begrunnelse":"1-2 setninger pa norsk om hvorfor/hvorfor ikke egnet for Mesta","risikoer":["konkret risiko"]}]

Skala: Anbefalt=7-10 (klar for kontrakt), Mulig=4-6 (potensial men usikkerhet), Lav prioritet=1-3 (lite egnet).
Vekt: riktig kompetanse > kapasitet > erfaring/alder > storrelse.`;

    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    return safeParseJSON(msg.content.find(b => b.type === "text")?.text || "");
  } catch(e) {
    console.log("Score error:", e.message);
    return [];
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { location, locations, equipment, equipments, complete } = req.body;

    // Støtte enkelt location eller locations-array (flervalg av kommuner)
    const locationList = (locations && locations.length > 0) ? locations : (location ? [location] : []);
    if (!locationList.length) return res.status(400).json({ error: "Mangler location" });

    // Support single or multiple categories
    const eqList = equipments && equipments.length > 0 ? equipments : [equipment];
    if (!eqList[0]) return res.status(400).json({ error: "Mangler equipment" });

    // Merge NACE, keywords and purposeKeywords from all categories
    const allNace = [...new Set(eqList.flatMap(eq => NACE[eq] || []))];
    const allKeywords = [...new Set(eqList.flatMap(eq => KEYWORDS[eq] || []))];
    const allPurpose = [...new Set(eqList.flatMap(eq => PURPOSE_KEYWORDS[eq] || []))];

    // Bruk kommunenummere fra frontend direkte hvis tilgjengelig (unngaar ekstra API-kall).
    // For fylker (ingen knr sendt) brukes FYLKE_NR-hardkodingen eller dynamisk oppslag.
    const { kommunenummere } = req.body;
    let allKommuneNrs;
    if (kommunenummere && kommunenummere.length > 0) {
      // Frontend sendte eksakte kommunenummer — bruk dem direkte
      allKommuneNrs = [...new Set(kommunenummere)];
    } else {
      // Fylkessok eller fallback: slaa opp via FYLKE_NR eller Brreg
      allKommuneNrs = [...new Set(
        (await Promise.all(locationList.map(loc => getKommuneNr(loc)))).flat()
      )];
    }
    if (!allKommuneNrs.length) return res.status(400).json({ error: "Fant ingen kommunenummer for valgt sted" });

    // Slaa sammen location-label for visning
    const locationLabel = locationList.join(", ");

    // Soek pa tvers av alle kommuner (allerede parallel i brregSearch)
    const isCounty = allKommuneNrs.length > 5 && locationList.length === 1;
    const toSearch = isCounty && !complete ? allKommuneNrs.slice(0, 5) : allKommuneNrs;
    const rawResults = (await Promise.all(
      toSearch.map(nr => brregSearchByKommune(nr, allNace, allKeywords, allPurpose))
    )).flat();
    const seen = new Set();
    const companies = rawResults.filter(e => {
      if (seen.has(e.organisasjonsnummer)) return false;
      seen.add(e.organisasjonsnummer);
      return true;
    });
    // location = locationLabel (allerede definert som const ovenfor via locationList)
    console.log(`Brreg: ${companies.length} treff for ${locationLabel}/${eqList.join('+')}`);

    if (companies.length === 0) {
      return res.json({ companies: [], source: "brreg" });
    }

    // Sorter paa ansatte foer vi kutter, slik at etablerte selskaper (som PER TRY AS med 27 ansatte)
    // ikke faller ut naar mange kategorier er valgt samtidig og det er 300+ treff totalt.
    const top = companies
      .sort((a, b) => (b.antallAnsatte || 0) - (a.antallAnsatte || 0))
      .slice(0, 150);

    // Hent alle dagligLeder parallelt i stedet for sekvensielle batches.
    // Brreg takler dette fint, og vi sparer 14 sekunder med 150 selskaper.
    async function fetchAllManagers(list) {
      const pairs = await Promise.all(
        list.map(c => fetchDagligLeder(c.organisasjonsnummer)
          .then(name => [c.organisasjonsnummer, name])
          .catch(() => [c.organisasjonsnummer, ""])
        )
      );
      return new Map(pairs);
    }

    // konkurs/underAvvikling er allerede filtrert i Brreg-spoerringa (konkurs=false&underAvvikling=false).
    // Keyword-soeket har samme filter. Vi dropper dermed checkBankruptcy-kallet (spar 150 API-kall).
    const managerMap = await fetchAllManagers(top);
    const bankruptResults = top.map(() => false);

    // Kategorier der ENK uten ansatte typisk ikke har kapasitet til driftskontrakt-volum.
    // For vintertraktor, naturlike og parklike er ENK/bonde uten ansatte fullt ut aktuell.
    const operativeKategorier = ["graving", "vinterlastebil", "renhold", "pukkverk", "trafikk"];
    const erOperativKategori = eqList.some(eq => operativeKategorier.includes(eq));
    const kunOperative = eqList.every(eq => operativeKategorier.includes(eq));

    const enriched = top
      .filter(c => {
        // Filtrer holdingselskaper (hjelpeenhetskode 70.100 eller "HOLDING"/"INVEST" i navn uten operativ NACE)
        const navn = c.navn?.toUpperCase() || "";
        const hjelp = c.hjelpeenhetskode?.kode || "";
        const naceKode = c.naeringskode1?.kode || "";
        const operativeNace = ["43.", "42.", "41.", "81.", "49.", "52.", "80.", "74.", "37.", "38.", "02.", "01.", "08.", "23."];
        const harOperativNace = operativeNace.some(p => naceKode.startsWith(p));
        if (hjelp === "70.100" && !harOperativNace) return false;
        if ((navn.includes("HOLDING") || navn.includes(" INVEST ") || navn.endsWith(" INVEST AS")) && !harOperativNace) return false;
        // For rent operative kategorier (graving, lastebil, renhold osv.) — filtrer ENK med 0 ansatte og stiftet siste 2 ar
        if (kunOperative) {
          const orgform = c.organisasjonsform?.kode || "";
          const stiftetAar = parseInt(c.stiftelsesdato?.slice(0, 4) || "0");
          const alder = new Date().getFullYear() - stiftetAar;
          if (orgform === "ENK" && (c.antallAnsatte || 0) === 0 && alder < 2) return false;
        }
        return true;
      })
      .map((c, idx) => ({
        navn: c.navn,
        orgnr: c.organisasjonsnummer,
        kommune: c.forretningsadresse?.kommune || locationLabel,
        adresse: (c.forretningsadresse?.adresse || []).join(", "),
        postnummer: c.forretningsadresse?.postnummer || "",
        poststed: c.forretningsadresse?.poststed || "",
        nace: c.naeringskode1?.beskrivelse || "",
        naceKode: c.naeringskode1?.kode || "",
        ansatte: c.antallAnsatte || 0,
        stiftet: c.stiftelsesdato?.slice(0, 4) || "",
        organisasjonsform: c.organisasjonsform?.beskrivelse || "",
        organisasjonsformKode: c.organisasjonsform?.kode || "",
        telefon: c.telefon || c.mobil || "",
        epost: c.epostadresse || "",
        nettside: c.hjemmeside || "",
        proff: `https://www.proff.no/selskap/-/-/-/${c.organisasjonsnummer}/`,
        dagligLeder: managerMap.get(c.organisasjonsnummer) || "",
        konkurs: bankruptResults[idx],
      }));

    const active = enriched.filter(c => !c.konkurs);
    const bankrupt = enriched.filter(c => c.konkurs);
    const scores = await scoreCompanies(active, eqList.join("+"), location);

    // Merge scores
    const scoreMap = new Map(scores.map(s => [s.orgnr, s]));
    const final = active.map(c => {
      const ai = scoreMap.get(c.orgnr) || {};
      // Default score
      // Selskaper som matcher pa NACE-kode (ikke bare navn/sokord) fa bonus.
      // Brreg returnerer naeringskode1.kode pa enheten — dette er det sterkeste signalet.
      const naceMatch = allNace.some(n => c.naceKode && c.naceKode.startsWith(n.slice(0,5)));
      const alder = c.stiftet ? (new Date().getFullYear() - parseInt(c.stiftet)) : 0;
      // Aldersfaktor: 10+ aar i bransjen = etablert, 5-9 = erfaren, <3 = nystartet risiko
      const alderBonus = alder >= 10 ? 2 : alder >= 5 ? 1 : alder < 3 ? -1 : 0;
      // ENK/bonde-bonus for traktor/naturlike/parklike — disse er fullt ut relevante
      const traktorKategorier = ["vintertraktor", "naturlike", "parklike", "vinter"];
      const erTraktorKategori = eqList.some(eq => traktorKategorier.includes(eq));
      const enkBonus = (c.organisasjonsformKode === "ENK" && erTraktorKategori && naceMatch) ? 1 : 0;
      const baseScore = c.ansatte >= 20 ? 7
                      : c.ansatte >= 10 ? 6
                      : c.ansatte >= 3  ? 5
                      : c.ansatte >= 1  ? 4
                      : 3;
      // Boost score hvis NACE matcher direkte (indikerer kjernevirksomhet, ikke bare bifunn via sokord)
      const naceBonus = naceMatch ? 1 : 0;
      const finalDefaultScore = Math.min(Math.max(baseScore + naceBonus + alderBonus + enkBonus, 1), 9);
      return {
        ...c,
        score: ai.score || finalDefaultScore,
        anbefaling: ai.anbefaling || (finalDefaultScore >= 7 ? "Anbefalt" : finalDefaultScore >= 5 ? "Mulig" : "Lav prioritet"),
        begrunnelse: ai.begrunnelse || "",
        risikoer: ai.risikoer || [],
      };
    }).sort((a, b) => (b.score||0) - (a.score||0));

    const bankruptFmt = bankrupt.map(c => ({
      ...c, score: 0, anbefaling: "Konkurs",
      begrunnelse: "Registrert konkursbo", risikoer: ["Konkurs registrert i Brreg"],
    }));

    res.json({ companies: [...final, ...bankruptFmt], source: "brreg", total: companies.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
