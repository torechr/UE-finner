const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

const NACE = {
  lastebil: ["49.41", "49.42", "52.29", "43.12", "08.11", "08.12"],
  traktor:  ["01.61", "01.62", "01.11", "01.13", "01.41", "81.30"],
  graver:   ["43.12", "43.13", "42.11", "42.21", "41.20"],
};

// Hardkodet kommunenummer-mapping (alle norske kommuner 2024)
const KOMMUNE_NR = {
  // Agder
  "arendal":["4203"],"birkenes":["4209"],"bygland":["4215"],"bykle":["4216"],
  "evje og hornnes":["4214"],"farsund":["4206"],"flekkefjord":["4207"],"froland":["4208"],
  "gjerstad":["4211"],"grimstad":["4202"],"hægebostad":["4219"],"iveland":["4220"],
  "kristiansand":["4204"],"kvinesdal":["4218"],"lillesand":["4201"],"lindesnes":["4205"],
  "lyngdal":["4217"],"risør":["4210"],"tvedestrand":["4212"],"valle":["4213"],
  "vegårshei":["4221"],"åmli":["4222"],"åseral":["4223"],
  // Akershus
  "asker":["3203"],"aurskog-høland":["3205"],"bærum":["3201"],"enebakk":["3209"],
  "frogn":["3215"],"gjerdrum":["3213"],"hurdal":["3207"],"lørenskog":["3211"],
  "nannestad":["3217"],"nesodden":["3219"],"nittedal":["3221"],"rælingen":["3223"],
  "ullensaker":["3225"],"vestby":["3227"],"ås":["3229"],
  // Buskerud
  "drammen":["3005"],"flå":["3307"],"flesberg":["3309"],"gol":["3311"],
  "hemsedal":["3313"],"hol":["3315"],"hole":["3317"],"kongsberg":["3303"],
  "krødsherad":["3319"],"lier":["3321"],"modum":["3323"],"nedre eiker":["3325"],
  "nore og uvdal":["3327"],"ringerike":["3301"],"rollag":["3329"],"sigdal":["3331"],
  "øvre eiker":["3333"],"ål":["3305"],
  // Finnmark
  "alta":["5601"],"berlevåg":["5603"],"båtsfjord":["5605"],"gamvik":["5607"],
  "hammerfest":["5609"],"hasvik":["5611"],"karasjok":["5613"],"kautokeino":["5615"],
  "lebesby":["5617"],"loppa":["5619"],"måsøy":["5621"],"nesseby":["5623"],
  "nordkapp":["5625"],"porsanger":["5627"],"sør-varanger":["5629"],"tana":["5631"],
  "vadsø":["5633"],"vardø":["5635"],
  // Innlandet
  "alvdal":["3439"],"dovre":["3419"],"engerdal":["3429"],"etnedal":["3437"],
  "folldal":["3441"],"gausdal":["3411"],"gjøvik":["3407"],"gran":["3435"],
  "hamar":["3403"],"jevnaker":["3433"],"kongsvinger":["3401"],"lesja":["3421"],
  "lillehammer":["3405"],"lom":["3423"],"lunner":["3431"],"løten":["3413"],
  "nord-aurdal":["3443"],"nord-fron":["3415"],"nord-odal":["3417"],"nordre land":["3445"],
  "os":["3447"],"rendalen":["3449"],"ringebu":["3451"],"ringsaker":["3409"],
  "sel":["3453"],"skjåk":["3455"],"sør-aurdal":["3457"],"sør-fron":["3459"],
  "sør-odal":["3461"],"søndre land":["3463"],"tolga":["3465"],"trysil":["3467"],
  "tynset":["3469"],"vestre slidre":["3471"],"vestre toten":["3473"],"vågå":["3475"],
  "øyer":["3477"],"øystre slidre":["3479"],"østre toten":["3481"],"åsnes":["3483"],
  // Møre og Romsdal
  "aukra":["1508"],"aure":["1511"],"averøy":["1514"],"fjord":["1515"],
  "fræna":["1516"],"giske":["1517"],"gjemnes":["1519"],"haram":["1520"],
  "hareid":["1523"],"herøy":["1524"],"kristiansund":["1505"],"molde":["1506"],
  "rauma":["1526"],"rindal":["1528"],"smøla":["1531"],"stranda":["1532"],
  "surnadal":["1535"],"sykkylven":["1539"],"tingvoll":["1543"],"ulstein":["1545"],
  "vanylven":["1546"],"vestnes":["1547"],"volda":["1548"],"ørsta":["1551"],
  "ålesund":["1507"],
  // Nordland
  "alstahaug":["1811"],"andøy":["1812"],"bindal":["1813"],"bodø":["1804"],
  "brønnøy":["1815"],"bø":["1816"],"dønna":["1818"],"evenes":["1820"],
  "fauske":["1822"],"flakstad":["1824"],"gildeskål":["1825"],"grane":["1826"],
  "hadsel":["1827"],"hamarøy":["1828"],"hattfjelldal":["1832"],"hemnes":["1833"],
  "herøy":["1834"],"leirfjord":["1835"],"lødingen":["1836"],"meløy":["1837"],
  "moskenes":["1838"],"narvik":["1806"],"nesna":["1839"],"rana":["1840"],
  "rødøy":["1841"],"røst":["1845"],"saltdal":["1848"],"sortland":["1851"],
  "steigen":["1853"],"sømna":["1856"],"sørfold":["1857"],"vefsn":["1859"],
  "vega":["1860"],"vestvågøy":["1865"],"vevelstad":["1866"],"værøy":["1867"],
  "øksnes":["1868"],
  // Oslo
  "oslo":["0301"],
  // Rogaland
  "bjerkreim":["1114"],"bokn":["1145"],"eigersund":["1101"],"gjesdal":["1122"],
  "hjelmeland":["1124"],"hå":["1119"],"karmøy":["1149"],"klepp":["1120"],
  "kvitsøy":["1144"],"lund":["1112"],"randaberg":["1127"],"sauda":["1130"],
  "sandnes":["1108"],"sokndal":["1111"],"sola":["1103"],"stavanger":["1103"],
  "strand":["1146"],"time":["1121"],"tysvær":["1133"],"utsira":["1151"],
  "vindafjord":["1160"],
  // Telemark
  "bamble":["3811"],"bø":["3813"],"drangedal":["3815"],"fyresdal":["3817"],
  "hjartdal":["3819"],"kviteseid":["3821"],"midt-telemark":["3823"],"nissedal":["3825"],
  "nome":["3827"],"notodden":["3829"],"porsgrunn":["3806"],"seljord":["3831"],
  "siljan":["3833"],"skien":["3807"],"tinn":["3835"],"tokke":["3837"],"vinje":["3839"],
  // Troms
  "balsfjord":["5411"],"bardu":["5412"],"dyrøy":["5413"],"harstad":["5402"],
  "ibestad":["5414"],"karlsøy":["5415"],"kvæfjord":["5416"],"kvænangen":["5417"],
  "kåfjord":["5418"],"lavangen":["5419"],"lenvik":["5420"],"lyngen":["5421"],
  "målselv":["5422"],"nordreisa":["5423"],"salangen":["5424"],"skjervøy":["5425"],
  "skånland":["5426"],"storfjord":["5427"],"sørreisa":["5428"],"tjeldsund":["5429"],
  "tranøy":["5430"],"tromsø":["5401"],
  // Trøndelag
  "flatanger":["5036"],"frosta":["5037"],"frøya":["5038"],"grong":["5041"],
  "heim":["5042"],"hitra":["5043"],"holtålen":["5044"],"høylandet":["5045"],
  "inderøy":["5046"],"indre fosen":["5047"],"leka":["5049"],"levanger":["5020"],
  "lierne":["5052"],"malvik":["5053"],"melhus":["5054"],"meråker":["5055"],
  "midtre gauldal":["5056"],"namsos":["5007"],"namsskogan":["5057"],"nærøysund":["5058"],
  "oppdal":["5059"],"orkland":["5060"],"overhalla":["5061"],"rennebu":["5027"],
  "røros":["5025"],"røyrvik":["5028"],"selbu":["5029"],"skaun":["5030"],
  "snåsa":["5031"],"steinkjer":["5006"],"stjørdal":["5014"],"trondheim":["5001"],
  "tydal":["5032"],"verdal":["5021"],"ørland":["5033"],"åfjord":["5034"],
  // Vestfold
  "holmestrand":["3901"],"horten":["3903"],"larvik":["3905"],"sandefjord":["3907"],
  "svelvik":["3909"],"tønsberg":["3911"],
  // Vestland
  "alver":["4611"],"askøy":["4612"],"askvoll":["4613"],"aurland":["4614"],
  "austevoll":["4615"],"austrheim":["4616"],"bergen":["4601"],"bjørnafjorden":["4617"],
  "bremanger":["4618"],"bømlo":["4619"],"eidfjord":["4620"],"etne":["4621"],
  "fedje":["4622"],"fitjar":["4623"],"fjaler":["4624"],"gloppen":["4625"],
  "gulen":["4626"],"høyanger":["4627"],"hyllestad":["4628"],"kinn":["4629"],
  "kvam":["4630"],"kvinnherad":["4631"],"lærdal":["4632"],"luster":["4633"],
  "masfjorden":["4634"],"modalen":["4635"],"osterøy":["4636"],"samnanger":["4637"],
  "sogndal":["4638"],"solund":["4639"],"stad":["4640"],"stord":["4641"],
  "stryn":["4642"],"sunnfjord":["4643"],"sveio":["4644"],"tysnes":["4645"],
  "ullensvang":["4646"],"ulvik":["4647"],"vik":["4648"],"voss":["4649"],
  "øygarden":["4650"],"årdal":["4651"],
  // Østfold
  "aremark":["3101"],"eidsberg":["3103"],"fredrikstad":["3004"],"halden":["3001"],
  "hobøl":["3105"],"hvaler":["3107"],"marker":["3110"],"moss":["3002"],
  "rakkestad":["3112"],"råde":["3114"],"rømskog":["3116"],"sarpsborg":["3003"],
  "skiptvet":["3118"],"spydeberg":["3120"],"trøgstad":["3122"],"våler":["3124"],
  // Fylker
  "agder":["4201","4202","4203","4204","4205","4206","4207","4208","4209","4210","4211","4212","4213","4214","4215","4216","4217","4218","4219","4220","4221","4222","4223"],
  "akershus":["3201","3203","3205","3207","3209","3211","3213","3215","3217","3219","3221","3223","3225","3227","3229"],
  "buskerud":["3301","3303","3305","3307","3309","3311","3313","3315","3317","3319","3321","3323","3325","3327","3329","3331","3333","3005"],
  "finnmark":["5601","5603","5605","5607","5609","5611","5613","5615","5617","5619","5621","5623","5625","5627","5629","5631","5633","5635"],
  "innlandet":["3401","3403","3405","3407","3409","3411","3413","3415","3417","3419","3421","3423","3425","3427","3429","3431","3433","3435","3437","3439","3441","3443","3445","3447","3449","3451","3453","3455","3457","3459","3461","3463","3465","3467","3469","3471","3473","3475","3477","3479","3481","3483"],
  "møre og romsdal":["1505","1506","1507","1508","1511","1514","1515","1516","1517","1519","1520","1523","1524","1526","1528","1531","1532","1535","1539","1543","1545","1546","1547","1548","1551"],
  "nordland":["1804","1806","1811","1812","1813","1815","1816","1818","1820","1822","1824","1825","1826","1827","1828","1832","1833","1834","1835","1836","1837","1838","1839","1840","1841","1845","1848","1851","1853","1856","1857","1859","1860","1865","1866","1867","1868"],
  "oslo":["0301"],
  "rogaland":["1101","1103","1108","1111","1112","1114","1119","1120","1121","1122","1124","1127","1130","1133","1144","1145","1146","1149","1151","1160"],
  "telemark":["3806","3807","3811","3813","3815","3817","3819","3821","3823","3825","3827","3829","3831","3833","3835","3837","3839"],
  "troms":["5401","5402","5411","5412","5413","5414","5415","5416","5417","5418","5419","5420","5421","5422","5423","5424","5425","5426","5427","5428","5429","5430"],
  "trøndelag":["5001","5006","5007","5014","5020","5021","5025","5027","5028","5029","5030","5031","5032","5033","5034","5036","5037","5038","5041","5042","5043","5044","5045","5046","5047","5049","5052","5053","5054","5055","5056","5057","5058","5059","5060","5061"],
  "vestfold":["3901","3903","3905","3907","3909","3911"],
  "vestland":["4601","4611","4612","4613","4614","4615","4616","4617","4618","4619","4620","4621","4622","4623","4624","4625","4626","4627","4628","4629","4630","4631","4632","4633","4634","4635","4636","4637","4638","4639","4640","4641","4642","4643","4644","4645","4646","4647","4648","4649","4650","4651"],
  "østfold":["3001","3002","3003","3004","3101","3103","3105","3107","3110","3112","3114","3116","3118","3120","3122","3124"],
};

function getKommuneNr(location) {
  return KOMMUNE_NR[location.toLowerCase().trim()] || [];
}

async function brregFetch(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function brregSearchByKommune(kommuneNr, naceCodes) {
  // Fetch all NACE codes in parallel
  const promises = naceCodes.map(nace =>
    brregFetch(`https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=${nace}&kommunenummer=${kommuneNr}&size=50&konkurs=false&underAvvikling=false&organisasjonsform=AS,ENK,ANS,DA,SA,NUF,BA,STI,FLI`)
      .then(data => data?._embedded?.enheter || [])
      .catch(() => [])
  );
  const results = await Promise.all(promises);
  return results.flat();
}

async function brregSearch(location, naceCodes) {
  const kommuneNrs = getKommuneNr(location);
  if (kommuneNrs.length === 0) return [];

  const isCounty = kommuneNrs.length > 5;
  // For fylker: søk topp 5 kommuner parallelt; for enkeltkommune: søk direkte
  const toSearch = isCounty ? kommuneNrs.slice(0, 5) : kommuneNrs;

  const allResults = (await Promise.all(
    toSearch.map(nr => brregSearchByKommune(nr, naceCodes))
  )).flat();

  // Deduplicate by orgnr
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
    // Score top 15 by employees – best proxy for capacity
    const list = companies
      .sort((a, b) => (b.ansatte || 0) - (a.ansatte || 0))
      .slice(0, 15)
      .map(c => ({ orgnr: c.orgnr, navn: c.navn, nace: c.nace, ansatte: c.ansatte, stiftet: c.stiftet }));

    const prompt = `Du er innkjøpsekspert for Mesta AS. Vurder disse selskapene som underentreprenør for ${equipment} i ${location}. Svar KUN med JSON-array uten markdown:
${JSON.stringify(list)}
Format: [{"orgnr":"123","score":7,"anbefaling":"Anbefalt","begrunnelse":"Kort begrunnelse på norsk","risikoer":["risiko1"]}]
Skala: Anbefalt=7-10, Mulig=4-6, Lav prioritet=1-3. Vekt ansatte og erfaring høyt.`;

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
    const { location, equipment } = req.body;
    if (!location || !equipment) return res.status(400).json({ error: "Mangler location eller equipment" });

    const naceCodes = NACE[equipment] || NACE.graver;
    const companies = await brregSearch(location, naceCodes);
    console.log(`Brreg: ${companies.length} treff for ${location}/${equipment}`);

    // AI fallback hvis ingen Brreg-treff
    if (companies.length === 0) {
      const eqDesc = { lastebil: "truck transport", traktor: "tractor agricultural machinery", graver: "excavator construction machinery" }[equipment] || equipment;
      const msg = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1500,
        messages: [{ role: "user", content: `Return a JSON array of 8 real Norwegian subcontractor companies for ${eqDesc} in ${location}. Output ONLY the JSON array: [{"navn":"Firma AS","orgnr":"","kommune":"${location}","nace":"Transport","ansatte":5,"stiftet":"2010","score":7,"anbefaling":"Anbefalt","begrunnelse":"Good company","risikoer":[]}]` }],
      });
      const parsed = safeParseJSON(msg.content.find(b => b.type === "text")?.text || "");
      return res.json({ companies: parsed.sort((a, b) => (b.score||0)-(a.score||0)), source: "ai" });
    }

    // Enrich topp 30 – hent daglig leder og konkurssjekk parallelt
    const top = companies.slice(0, 30);
    const enriched = await Promise.all(top.map(async c => {
      const hasEmployees = (c.antallAnsatte || 0) > 0;
      const [isBankrupt, dagligLeder] = await Promise.all([
        hasEmployees ? checkBankruptcy(c.organisasjonsnummer) : Promise.resolve(false),
        fetchDagligLeder(c.organisasjonsnummer),
      ]);
      return {
        navn: c.navn,
        orgnr: c.organisasjonsnummer,
        kommune: c.forretningsadresse?.kommune || location,
        adresse: (c.forretningsadresse?.adresse || []).join(", "),
        postnummer: c.forretningsadresse?.postnummer || "",
        poststed: c.forretningsadresse?.poststed || "",
        nace: c.naeringskode1?.beskrivelse || "",
        ansatte: c.antallAnsatte || 0,
        stiftet: c.stiftelsesdato?.slice(0, 4) || "",
        organisasjonsform: c.organisasjonsform?.beskrivelse || "",
        telefon: c.telefon || c.mobil || "",
        epost: c.epostadresse || "",
        nettside: c.hjemmeside || "",
        dagligLeder,
        konkurs: isBankrupt,
      };
    }));

    const active = enriched.filter(c => !c.konkurs);
    const bankrupt = enriched.filter(c => c.konkurs);
    const scores = await scoreCompanies(active, equipment, location);

    // Merge scores – uscorede selskaper får score basert på ansatte
    const scoreMap = new Map(scores.map(s => [s.orgnr, s]));
    const final = active.map(c => {
      const ai = scoreMap.get(c.orgnr) || {};
      // Gi fornuftig default-score basert på ansatte for uscorede selskaper
      const defaultScore = c.ansatte >= 10 ? 6 : c.ansatte >= 3 ? 5 : 4;
      return {
        ...c,
        score: ai.score || defaultScore,
        anbefaling: ai.anbefaling || (defaultScore >= 6 ? "Mulig" : "Lav prioritet"),
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
