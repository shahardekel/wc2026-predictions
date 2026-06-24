/**
 * WC 2026 Prediction Engine — Dixon-Coles Poisson + Bayesian Elo
 *
 * Architecture:
 *  1. Per-team attack/defense λ parameters via Bayesian update:
 *     Prior = FIFA rank + squad depth → posterior blended with WC xG data
 *     (exponential-decay weighting: most recent game counts most)
 *  2. Match rate parameters (multiplicative form):
 *     λ_home = leagueAvg × attackH × (defenseA / leagueAvg) × homeAdv
 *     λ_away = leagueAvg × attackA × (defenseH / leagueAvg)
 *  3. Full 10×10 score probability matrix with Dixon-Coles (1997) correction
 *     for low-score cells (0-0, 1-0, 0-1, 1-1), then sum for 1X2 probs
 *  4. Elo ratings (K=32) updated from WC results — secondary calibration signal
 *  5. Final probs: 55% Poisson + 40% bookmaker market + 5% Elo (when market available)
 *     No market: 82% Poisson + 18% Elo
 */

// ─── STATIC DATA ─────────────────────────────────────────────────────────────

const FIFA_RANKINGS = {
  "France":1,"Brazil":2,"England":3,"Portugal":4,"Spain":5,"Argentina":6,
  "Belgium":7,"Netherlands":8,"Germany":9,"Morocco":10,"USA":11,"Croatia":12,
  "Colombia":13,"Norway":14,"Mexico":15,"Japan":16,"Senegal":17,"Uruguay":18,
  "Switzerland":19,"Australia":20,"South Korea":21,"Egypt":22,"Ecuador":23,
  "Austria":24,"Denmark":25,"Turkey":26,"Sweden":27,"Scotland":28,"Canada":29,
  "Iran":30,"Algeria":31,"Tunisia":32,"Ghana":33,"Paraguay":34,"Saudi Arabia":35,
  "Cape Verde":36,"Iraq":37,"New Zealand":38,"Ivory Coast":39,"South Africa":40,
  "Haiti":41,"Qatar":42,"Curaçao":43,"Bosnia & Herzegovina":44,"Uzbekistan":45,
  "Panama":46,"Jordan":47,"Czechia":48,"DR Congo":49,"Bolivia":50,
  "Congo DR":49,
};

// WC 2022 group stage — used as historical prior (0.25× recency weight)
const WC2022_RESULTS = [
  // Group A
  { home:"Qatar",       away:"Ecuador",      hg:0,ag:2, hxg:0.38,axg:1.82 },
  { home:"Senegal",     away:"Netherlands",  hg:0,ag:2, hxg:0.70,axg:1.95 },
  { home:"Qatar",       away:"Senegal",      hg:1,ag:3, hxg:0.82,axg:2.10 },
  { home:"Netherlands", away:"Ecuador",      hg:1,ag:1, hxg:1.45,axg:1.05 },
  { home:"Ecuador",     away:"Senegal",      hg:1,ag:2, hxg:1.12,axg:1.68 },
  { home:"Netherlands", away:"Qatar",        hg:2,ag:0, hxg:2.35,axg:0.42 },
  // Group B
  { home:"England",     away:"Iran",         hg:6,ag:2, hxg:3.10,axg:0.85 },
  { home:"USA",         away:"Wales",        hg:1,ag:1, hxg:1.42,axg:0.92 },
  { home:"Wales",       away:"Iran",         hg:0,ag:2, hxg:0.95,axg:1.35 },
  { home:"England",     away:"USA",          hg:0,ag:0, hxg:1.68,axg:0.48 },
  { home:"Wales",       away:"England",      hg:0,ag:3, hxg:0.52,axg:2.25 },
  { home:"Iran",        away:"USA",          hg:0,ag:1, hxg:0.85,axg:1.12 },
  // Group C
  { home:"Argentina",   away:"Saudi Arabia", hg:1,ag:2, hxg:2.85,axg:0.45 },
  { home:"Mexico",      away:"Poland",       hg:0,ag:0, hxg:1.20,axg:0.95 },
  { home:"Poland",      away:"Saudi Arabia", hg:2,ag:0, hxg:1.55,axg:0.80 },
  { home:"Argentina",   away:"Mexico",       hg:2,ag:0, hxg:1.78,axg:0.62 },
  { home:"Poland",      away:"Argentina",    hg:0,ag:2, hxg:0.75,axg:2.10 },
  { home:"Saudi Arabia",away:"Mexico",       hg:1,ag:2, hxg:0.92,axg:1.65 },
  // Group D
  { home:"Denmark",     away:"Tunisia",      hg:0,ag:0, hxg:1.45,axg:0.52 },
  { home:"France",      away:"Australia",    hg:4,ag:1, hxg:2.52,axg:0.65 },
  { home:"Tunisia",     away:"Australia",    hg:0,ag:1, hxg:0.75,axg:1.02 },
  { home:"France",      away:"Denmark",      hg:2,ag:1, hxg:1.82,axg:1.12 },
  { home:"Tunisia",     away:"France",       hg:1,ag:0, hxg:0.58,axg:2.45 },
  { home:"Australia",   away:"Denmark",      hg:1,ag:0, hxg:0.82,axg:1.55 },
  // Group E
  { home:"Spain",       away:"Costa Rica",   hg:7,ag:0, hxg:3.85,axg:0.18 },
  { home:"Germany",     away:"Japan",        hg:1,ag:2, hxg:2.28,axg:0.82 },
  { home:"Japan",       away:"Costa Rica",   hg:0,ag:1, hxg:1.62,axg:0.35 },
  { home:"Spain",       away:"Germany",      hg:1,ag:1, hxg:1.95,axg:1.35 },
  { home:"Japan",       away:"Spain",        hg:2,ag:1, hxg:0.72,axg:2.85 },
  { home:"Costa Rica",  away:"Germany",      hg:2,ag:4, hxg:0.95,axg:2.90 },
  // Group F
  { home:"Morocco",     away:"Croatia",      hg:0,ag:0, hxg:0.88,axg:1.25 },
  { home:"Belgium",     away:"Canada",       hg:1,ag:0, hxg:0.75,axg:2.05 },
  { home:"Morocco",     away:"Belgium",      hg:2,ag:0, hxg:1.25,axg:1.45 },
  { home:"Croatia",     away:"Canada",       hg:4,ag:1, hxg:2.45,axg:0.98 },
  { home:"Croatia",     away:"Belgium",      hg:0,ag:0, hxg:1.05,axg:1.15 },
  { home:"Morocco",     away:"Canada",       hg:2,ag:1, hxg:1.42,axg:0.95 },
  // Group G
  { home:"Switzerland", away:"Cameroon",     hg:1,ag:0, hxg:1.55,axg:0.68 },
  { home:"Brazil",      away:"Serbia",       hg:2,ag:0, hxg:2.85,axg:0.72 },
  { home:"Brazil",      away:"Switzerland",  hg:1,ag:0, hxg:1.82,axg:0.75 },
  { home:"Cameroon",    away:"Serbia",       hg:3,ag:3, hxg:1.85,axg:2.15 },
  { home:"Serbia",      away:"Switzerland",  hg:2,ag:3, hxg:1.65,axg:2.35 },
  { home:"Brazil",      away:"Cameroon",     hg:0,ag:1, hxg:2.25,axg:0.42 },
  // Group H
  { home:"Uruguay",     away:"South Korea",  hg:0,ag:0, hxg:1.25,axg:0.85 },
  { home:"Portugal",    away:"Ghana",        hg:3,ag:2, hxg:2.15,axg:1.05 },
  { home:"South Korea", away:"Ghana",        hg:2,ag:3, hxg:1.45,axg:1.92 },
  { home:"Portugal",    away:"Uruguay",      hg:2,ag:0, hxg:1.85,axg:1.12 },
  { home:"South Korea", away:"Portugal",     hg:2,ag:1, hxg:0.95,axg:2.45 },
  { home:"Ghana",       away:"Uruguay",      hg:0,ag:2, hxg:0.72,axg:1.85 },
  // WC 2022 knockouts (key matches)
  { home:"Netherlands", away:"USA",          hg:3,ag:1, hxg:2.45,axg:1.12 },
  { home:"Argentina",   away:"Australia",    hg:2,ag:1, hxg:2.35,axg:0.88 },
  { home:"France",      away:"Poland",       hg:3,ag:1, hxg:2.85,axg:0.62 },
  { home:"England",     away:"Senegal",      hg:3,ag:0, hxg:2.42,axg:0.52 },
  { home:"Morocco",     away:"Spain",        hg:0,ag:0, hxg:0.65,axg:2.15 }, // Morocco won on pens
  { home:"Croatia",     away:"Japan",        hg:1,ag:1, hxg:1.35,axg:1.55 }, // Croatia won on pens
  { home:"Netherlands", away:"Argentina",    hg:2,ag:2, hxg:1.85,axg:2.35 }, // Argentina on pens
  { home:"France",      away:"England",      hg:2,ag:1, hxg:2.25,axg:1.45 },
  { home:"Argentina",   away:"Croatia",      hg:3,ag:0, hxg:2.65,axg:0.68 },
  { home:"France",      away:"Morocco",      hg:2,ag:0, hxg:2.15,axg:0.72 },
  { home:"Argentina",   away:"France",       hg:3,ag:3, hxg:2.45,axg:2.35 }, // Argentina on pens
];

const WC_RESULTS = [
  { home:"Mexico",       away:"South Africa",    hg:2,ag:0, hxg:1.41,axg:0.07 },
  { home:"South Korea",  away:"Czechia",         hg:2,ag:1, hxg:1.84,axg:0.81 },
  { home:"Canada",       away:"Bosnia & Herzegovina", hg:1,ag:1, hxg:1.25,axg:0.98 },
  { home:"USA",          away:"Paraguay",        hg:4,ag:1, hxg:1.35,axg:0.32 },
  { home:"Qatar",        away:"Switzerland",     hg:1,ag:1, hxg:0.55,axg:1.82 },
  { home:"Brazil",       away:"Morocco",         hg:1,ag:1, hxg:1.20,axg:0.95 },
  { home:"Haiti",        away:"Scotland",        hg:0,ag:1, hxg:0.31,axg:0.88 },
  { home:"Australia",    away:"Türkiye",         hg:2,ag:0, hxg:1.45,axg:0.72 },
  { home:"Germany",      away:"Curaçao",         hg:7,ag:1, hxg:4.20,axg:0.35 },
  { home:"Netherlands",  away:"Japan",           hg:2,ag:2, hxg:2.80,axg:1.90 },
  { home:"Ivory Coast",  away:"Ecuador",         hg:1,ag:0, hxg:0.92,axg:1.03 },
  { home:"Sweden",       away:"Tunisia",         hg:5,ag:1, hxg:2.85,axg:0.28 },
  { home:"Spain",        away:"Cape Verde",      hg:0,ag:0, hxg:2.29,axg:0.30 },
  { home:"Belgium",      away:"Egypt",           hg:1,ag:1, hxg:1.35,axg:1.08 },
  { home:"Saudi Arabia", away:"Uruguay",         hg:1,ag:1, hxg:0.99,axg:1.54 },
  { home:"Iran",         away:"New Zealand",     hg:2,ag:2, hxg:1.50,axg:1.24 },
  { home:"France",       away:"Senegal",         hg:3,ag:1, hxg:1.79,axg:0.56 },
  { home:"Iraq",         away:"Norway",          hg:1,ag:4, hxg:0.77,axg:2.53 },
  { home:"Argentina",    away:"Algeria",         hg:3,ag:0, hxg:1.23,axg:0.31 },
  { home:"Austria",      away:"Jordan",          hg:3,ag:1, hxg:1.66,axg:0.53 },
  { home:"Portugal",     away:"Congo DR",        hg:1,ag:1, hxg:0.64,axg:0.82 },
  { home:"Portugal",     away:"Uzbekistan",      hg:5,ag:0, hxg:3.80,axg:0.25 },
  { home:"England",      away:"Croatia",         hg:4,ag:2, hxg:2.80,axg:0.71 },
  { home:"Ghana",        away:"Panama",          hg:1,ag:0, hxg:1.31,axg:0.75 },
  { home:"Uzbekistan",   away:"Colombia",        hg:1,ag:3, hxg:1.16,axg:1.62 },
  { home:"Czechia",      away:"South Africa",    hg:1,ag:1, hxg:1.02,axg:0.68 },
  { home:"Switzerland",  away:"Bosnia & Herzegovina", hg:4,ag:1, hxg:2.10,axg:0.75 },
  { home:"Canada",       away:"Qatar",           hg:6,ag:0, hxg:3.20,axg:0.15 },
  { home:"Mexico",       away:"South Korea",     hg:1,ag:0, hxg:0.85,axg:1.10 },
  { home:"USA",          away:"Australia",       hg:2,ag:0, hxg:1.80,axg:0.90 },
  { home:"Scotland",     away:"Morocco",         hg:0,ag:1, hxg:0.45,axg:0.88 },
  { home:"Brazil",       away:"Haiti",           hg:3,ag:0, hxg:2.20,axg:0.18 },
  { home:"Türkiye",      away:"Paraguay",        hg:0,ag:1, hxg:0.72,axg:0.85 },
  { home:"Netherlands",  away:"Sweden",          hg:5,ag:1, hxg:2.61,axg:1.01 },
  { home:"Germany",      away:"Ivory Coast",     hg:2,ag:1, hxg:1.89,axg:1.22 },
  { home:"Ecuador",      away:"Curaçao",         hg:0,ag:0, hxg:3.05,axg:0.48 },
  { home:"Tunisia",      away:"Japan",           hg:0,ag:4, hxg:0.05,axg:2.13 },
  { home:"Spain",        away:"Saudi Arabia",    hg:4,ag:0, hxg:2.30,axg:0.15 },
  { home:"Belgium",      away:"Iran",            hg:0,ag:0, hxg:1.79,axg:0.62 },
  { home:"Uruguay",      away:"Cape Verde",      hg:2,ag:2, hxg:2.32,axg:0.88 },
  { home:"New Zealand",  away:"Egypt",           hg:1,ag:3, hxg:1.24,axg:1.87 },
  { home:"Argentina",    away:"Austria",         hg:2,ag:0, hxg:2.62,axg:0.50 },
  { home:"France",       away:"Iraq",            hg:3,ag:0, hxg:2.80,axg:0.22 },
  { home:"Norway",       away:"Senegal",         hg:3,ag:2, hxg:2.10,axg:1.45 },
  { home:"Jordan",       away:"Algeria",         hg:1,ag:2, hxg:0.85,axg:1.42 },
];

const H2H = {
  "Spain-Portugal":    { matches:4, homeWins:2, draws:1, awayWins:1 },
  "Argentina-France":  { matches:3, homeWins:2, draws:0, awayWins:1 },
  "Brazil-Germany":    { matches:8, homeWins:4, draws:1, awayWins:3 },
  "England-Germany":   { matches:5, homeWins:2, draws:1, awayWins:2 },
  "France-England":    { matches:6, homeWins:3, draws:1, awayWins:2 },
  "Netherlands-Germany":{ matches:6, homeWins:3, draws:1, awayWins:2 },
  "Argentina-England": { matches:4, homeWins:2, draws:0, awayWins:2 },
};

const VENUE_WEATHER = {
  "Atlanta":    { temp:30, humidity:65, condition:"Hot & Humid" },
  "Houston":    { temp:34, humidity:70, condition:"Very Hot & Humid" },
  "Miami":      { temp:31, humidity:72, condition:"Hot & Humid" },
  "Dallas":     { temp:35, humidity:45, condition:"Hot & Dry" },
  "Los Angeles":{ temp:24, humidity:55, condition:"Pleasant" },
  "New York":   { temp:26, humidity:60, condition:"Warm" },
  "Boston":     { temp:22, humidity:58, condition:"Comfortable" },
  "Seattle":    { temp:18, humidity:62, condition:"Cool" },
  "Kansas City":{ temp:32, humidity:55, condition:"Hot" },
  "Philadelphia":{ temp:28, humidity:60, condition:"Warm & Humid" },
  "San Francisco":{ temp:17, humidity:70, condition:"Cool & Foggy" },
  "Vancouver":  { temp:20, humidity:65, condition:"Comfortable" },
  "Toronto":    { temp:25, humidity:62, condition:"Warm" },
  "Mexico City":{ temp:22, humidity:50, condition:"Comfortable (High Altitude)" },
  "Guadalajara":{ temp:28, humidity:55, condition:"Warm" },
  "Monterrey":  { temp:36, humidity:40, condition:"Very Hot & Dry" },
};

const SOCIAL_BUZZ = {
  "France":95,"England":94,"Brazil":93,"Argentina":92,"Germany":90,
  "Spain":88,"Portugal":85,"Netherlands":84,"Norway":80,"USA":82,
  "Mexico":79,"Japan":75,"Morocco":73,"Colombia":72,"Croatia":70,
  "Belgium":68,"Uruguay":65,"Egypt":64,"Austria":60,"Switzerland":58,
  "Australia":55,"South Korea":54,"Senegal":50,"Turkey":48,"Scotland":52,
  "Canada":45,"Ecuador":42,"Algeria":40,"Ghana":38,"Sweden":37,
  "Cape Verde":35,"Iran":30,"New Zealand":28,"Saudi Arabia":32,"Uzbekistan":20,
  "Paraguay":22,"Tunisia":25,"Haiti":15,"Qatar":18,"Curaçao":12,
  "Panama":16,"Jordan":14,"Czechia":30,"DR Congo":22,"Congo DR":22,
  "Bosnia & Herzegovina":25,"Iraq":18,"South Africa":28,
};

const SQUAD_DEPTH = {
  "France":9.8,"England":9.5,"Brazil":9.3,"Germany":9.2,"Spain":9.5,
  "Portugal":9.0,"Netherlands":8.8,"Belgium":8.5,"Argentina":9.7,
  "Norway":8.0,"Colombia":7.8,"Croatia":8.2,"Japan":7.5,"Morocco":7.2,
  "USA":7.0,"Mexico":6.8,"Uruguay":7.3,"Egypt":7.0,"Austria":7.1,
  "Switzerland":7.4,"Australia":6.5,"South Korea":6.8,"Senegal":7.5,
  "Turkey":6.2,"Scotland":6.0,"Canada":6.3,"Iran":5.5,"Algeria":6.0,
  "Ghana":6.5,"Sweden":6.8,"Cape Verde":4.5,"New Zealand":4.0,
  "Saudi Arabia":5.0,"Uzbekistan":4.2,"Paraguay":5.5,"Tunisia":5.8,
  "Haiti":3.5,"Qatar":3.0,"Curaçao":3.5,"Panama":4.0,"Jordan":3.8,
  "Czechia":6.5,"DR Congo":5.8,"Congo DR":5.8,"Bosnia & Herzegovina":5.2,
  "Iraq":4.5,"South Africa":4.8,"Ecuador":5.5,"Ivory Coast":6.0,
  "Türkiye":6.2,
};

// ─── UTILITY ─────────────────────────────────────────────────────────────────

function normName(n) {
  return (n||"").toLowerCase()
    .replace(/türkiye/g,"turkey")
    .replace(/united states.*/g,"usa")
    .replace(/ir iran/g,"iran")
    .replace(/korea republic/g,"south korea")
    .replace(/côte\s+d.ivoire/g,"ivory coast")
    .replace(/cura.ao/g,"curacao")
    .replace(/cape verde|cabo verde/g,"cape verde")
    .replace(/dr congo|congo dr/g,"congo")
    .replace(/czechia|czech republic/g,"czechia")
    .replace(/bosnia.*/g,"bosnia")
    .replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();
}

// Lookup in an object by normalised name (fallback for name variants)
function lookupNorm(obj, teamName) {
  if (obj[teamName] !== undefined) return obj[teamName];
  const nn = normName(teamName);
  const key = Object.keys(obj).find(k => normName(k) === nn);
  return key !== undefined ? obj[key] : undefined;
}

// ─── LEAGUE-WIDE AVERAGE xG ──────────────────────────────────────────────────

const LEAGUE_AVG_XG = (() => {
  if (!WC_RESULTS.length) return 1.35;
  const total = WC_RESULTS.reduce((s, r) => s + r.hxg + r.axg, 0);
  return total / (WC_RESULTS.length * 2);
})();

// ─── ELO RATINGS ─────────────────────────────────────────────────────────────
// Initialised from FIFA ranks, then updated with WC results (K=32).
// A 30-point home edge is added when computing expected result in WC games
// (the "home" team in the schedule has marginally more local support).

const ELO_K = 32;

const ELO_RATINGS = (() => {
  const elo = {};
  // Prior: rank 1 → ~1890, rank 50 → ~1540
  for (const [team, rank] of Object.entries(FIFA_RANKINGS)) {
    const nn = normName(team);
    if (elo[nn] === undefined) elo[nn] = Math.round(1890 - (rank - 1) * 7);
  }
  // Live WC update
  for (const r of WC_RESULTS) {
    const hn = normName(r.home), an = normName(r.away);
    const eH = elo[hn] ?? 1550, eA = elo[an] ?? 1550;
    const expH = 1 / (1 + Math.pow(10, (eA - eH + 30) / 400));
    const result = r.hg > r.ag ? 1 : r.hg === r.ag ? 0.5 : 0;
    elo[hn] = (elo[hn] ?? 1550) + ELO_K * (result - expH);
    elo[an] = (elo[an] ?? 1550) + ELO_K * ((1 - result) - (1 - expH));
  }
  return elo;
})();

// ─── BAYESIAN ATTACK / DEFENSE PARAMETERS ────────────────────────────────────
// Each team gets an attack λ (expected goals scored vs average defence)
// and a defense λ (expected goals conceded vs average attack).
//
// Prior is derived from FIFA rank + squad depth.
// Posterior is a Bayesian blend: weight shifts toward observed as games increase.
// Exponential decay (γ=0.62) means the most recent WC game counts most.

const TEAM_STRENGTHS = (() => {
  const strengths = {};

  // Collect all team names we know about
  const allNames = new Set([
    ...Object.keys(FIFA_RANKINGS),
    ...Object.keys(SQUAD_DEPTH),
    ...WC_RESULTS.flatMap(r => [r.home, r.away]),
  ]);

  for (const team of allNames) {
    const nn = normName(team);
    if (strengths[nn]) continue;

    const rank  = lookupNorm(FIFA_RANKINGS, team) ?? 50;
    const depth = lookupNorm(SQUAD_DEPTH,   team) ?? 5;

    // Attack prior: rank 1 ≈ 1.52 × avg, rank 50 ≈ 0.76 × avg
    // Power chosen so top-5 produce ~2.0 xG/game vs average defense
    const rankAtkFactor  = Math.pow(50 / rank, 0.30);
    const depthAtkBoost  = Math.pow(depth / 5.5, 0.28);
    const priorAttack    = LEAGUE_AVG_XG * rankAtkFactor * depthAtkBoost;

    // Defense prior: rank 1 ≈ concedes 0.67 × avg, rank 50 ≈ 1.44 × avg
    const rankDefFactor  = Math.pow(rank / 50, 0.18);
    const priorDefense   = LEAGUE_AVG_XG * rankDefFactor;

    strengths[nn] = { priorAttack, priorDefense, games: 0, attack: priorAttack, defense: priorDefense };
  }

  // Accumulate WC 2026 results (newest→oldest, full weight)
  // Then WC 2022 results (lower recency weight = 0.25×)
  const teamObs = {}; // nn → [{xgFor, xgAgainst, w}]

  const addResults = (results, recencyScale) => {
    for (let i = results.length - 1; i >= 0; i--) {
      const r = results[i];
      for (const [nn, xgFor, xgAgainst] of [
        [normName(r.home), r.hxg, r.axg],
        [normName(r.away), r.axg, r.hxg],
      ]) {
        if (!teamObs[nn]) teamObs[nn] = [];
        teamObs[nn].push({ xgFor, xgAgainst, recencyScale });
      }
    }
  };

  addResults(WC_RESULTS, 1.0);    // current tournament — full weight
  addResults(WC2022_RESULTS, 0.25); // 2022 history — 25% recency weight

  const DECAY = 0.62; // per-position exponential decay within each source

  for (const [nn, obs] of Object.entries(teamObs)) {
    if (!strengths[nn]) continue;
    const s = strengths[nn];

    // Count effective WC 2026 games for Bayesian blend weight
    s.games = WC_RESULTS.filter(r =>
      normName(r.home) === nn || normName(r.away) === nn
    ).length;

    let totalW = 0, wtXgFor = 0, wtXgAgainst = 0;
    // Sort: 2026 first (recencyScale=1), then 2022 (recencyScale=0.25)
    const sorted = [...obs].sort((a, b) => b.recencyScale - a.recencyScale);
    sorted.forEach(({ xgFor, xgAgainst, recencyScale }, idx) => {
      const positionDecay = Math.pow(DECAY, idx);
      const w = positionDecay * recencyScale;
      wtXgFor     += xgFor     * w;
      wtXgAgainst += xgAgainst * w;
      totalW      += w;
    });

    const obsAttack  = wtXgFor     / totalW;
    const obsDefense = wtXgAgainst / totalW;

    // Bayesian blend: effective sample size includes down-weighted historical games
    const effectiveN = s.games + obs.filter(o => o.recencyScale < 1).length * 0.25;
    const obsW = 1 - 1 / (1 + effectiveN * 0.70);

    s.attack  = obsW * obsAttack  + (1 - obsW) * s.priorAttack;
    s.defense = obsW * obsDefense + (1 - obsW) * s.priorDefense;
  }

  return strengths;
})();

// ─── POISSON + DIXON-COLES ENGINE ────────────────────────────────────────────

// Poisson PMF in log-space for numerical stability
function poissonPMF(lambda, k) {
  if (k < 0 || lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// Dixon-Coles (1997) low-score correction τ
// Corrects for the empirical over-representation of 0-0 and 1-1 draws.
// ρ ≈ -0.03 is the consensus value from football literature.
const DC_RHO = -0.028;

function dcTau(i, j, lH, lA) {
  if (i === 0 && j === 0) return 1 - lH * lA * DC_RHO;
  if (i === 1 && j === 0) return 1 + lA * DC_RHO;
  if (i === 0 && j === 1) return 1 + lH * DC_RHO;
  if (i === 1 && j === 1) return 1 - DC_RHO;
  return 1;
}

// Compute full 10×10 score probability matrix and derive 1X2 probs + most likely score
function poissonMatchProbs(lambdaH, lambdaA) {
  const MAX = 9;
  let pH = 0, pD = 0, pA = 0;
  let bestP = 0, bestH = 1, bestA = 1;

  for (let i = 0; i <= MAX; i++) {
    for (let j = 0; j <= MAX; j++) {
      const p = Math.max(0,
        poissonPMF(lambdaH, i) * poissonPMF(lambdaA, j) * dcTau(i, j, lambdaH, lambdaA)
      );
      if (i > j)      pH += p;
      else if (i < j) pA += p;
      else            pD += p;
      if (p > bestP) { bestP = p; bestH = i; bestA = j; }
    }
  }

  const total = pH + pD + pA || 1;
  return {
    home: pH / total, draw: pD / total, away: pA / total,
    mlHome: bestH, mlAway: bestA,
    lambdaH, lambdaA,
  };
}

// ─── LEGACY HELPERS (unchanged) ──────────────────────────────────────────────

function getTeamForm(teamName) {
  const results = WC_RESULTS.filter(r =>
    normName(r.home) === normName(teamName) || normName(r.away) === normName(teamName)
  );
  if (!results.length) return { pts:0, gf:0, ga:0, xgf:0, xga:0, played:0 };
  let pts=0, gf=0, ga=0, xgf=0, xga=0;
  results.forEach(r => {
    const isHome = normName(r.home) === normName(teamName);
    const tg=isHome?r.hg:r.ag, og=isHome?r.ag:r.hg;
    const txg=isHome?r.hxg:r.axg, oxg=isHome?r.axg:r.hxg;
    gf+=tg; ga+=og; xgf+=txg; xga+=oxg;
    if (tg>og) pts+=3; else if (tg===og) pts+=1;
  });
  return { pts, gf, ga, xgf:xgf/results.length, xga:xga/results.length, played:results.length };
}

function getH2H(home, away) {
  const key1 = `${home}-${away}`, key2 = `${away}-${home}`;
  if (H2H[key1]) return H2H[key1];
  if (H2H[key2]) {
    const h = H2H[key2];
    return { matches:h.matches, homeWins:h.awayWins, draws:h.draws, awayWins:h.homeWins };
  }
  return null;
}

async function fetchOddsConsensus(home, away, oddsMap) { return oddsMap || null; }

async function fetchWeather(venue) {
  return VENUE_WEATHER[venue] || { temp:27, humidity:60, condition:"Warm" };
}

function weatherImpact(weather, team) {
  const hotTeams = ["Saudi Arabia","Egypt","Iran","Algeria","Morocco","Tunisia","Senegal","Ghana","Ivory Coast","South Africa","Cape Verde","DR Congo","Congo DR","Iraq","Jordan","Qatar","Ecuador","Colombia","Paraguay","Uruguay","Mexico","USA"];
  const coldTeams = ["Norway","Sweden","Scotland","Canada","Netherlands","Germany","Denmark","Switzerland","Czechia","Austria"];
  const isHot  = hotTeams.some(t  => normName(t) === normName(team));
  const isCold = coldTeams.some(t => normName(t) === normName(team));
  let mod = 0;
  if (weather.temp > 30) { if (isHot) mod+=0.05; if (isCold) mod-=0.08; }
  else if (weather.temp < 20) { if (isCold) mod+=0.05; if (isHot) mod-=0.05; }
  if (weather.humidity > 70 && isCold) mod-=0.05;
  return mod;
}

function socialMomentum(team) {
  return ((SOCIAL_BUZZ[team] || 30) - 50) / 1000;
}

// ─── MAIN PREDICTION FUNCTION ─────────────────────────────────────────────────

async function predict(home, away, venue = "Dallas", context = {}, oddsMap = null, handicap = null, totalLine = null, playerStats = null) {
  const hn = normName(home), an = normName(away);
  const homeForm = getTeamForm(home);
  const awayForm = getTeamForm(away);
  const homeRank = lookupNorm(FIFA_RANKINGS, home) ?? 50;
  const awayRank = lookupNorm(FIFA_RANKINGS, away) ?? 50;
  const weather  = await fetchWeather(venue);
  const odds     = await fetchOddsConsensus(home, away, oddsMap);
  const h2h      = getH2H(home, away);

  // ── TEAM STRENGTH PARAMETERS ──────────────────────────────────────────────
  const hStr = TEAM_STRENGTHS[hn] || { attack: LEAGUE_AVG_XG, defense: LEAGUE_AVG_XG, games: 0, priorAttack: LEAGUE_AVG_XG, priorDefense: LEAGUE_AVG_XG };
  const aStr = TEAM_STRENGTHS[an] || { attack: LEAGUE_AVG_XG, defense: LEAGUE_AVG_XG, games: 0, priorAttack: LEAGUE_AVG_XG, priorDefense: LEAGUE_AVG_XG };
  const hElo = ELO_RATINGS[hn] ?? 1550;
  const aElo = ELO_RATINGS[an] ?? 1550;

  // ── COMPUTE POISSON λ (multiplicative Dixon-Coles model) ──────────────────
  // λ_home = (attackH × defenseA) / leagueAvg × homeAdv
  // So if both average: λ = leagueAvg×leagueAvg/leagueAvg×homeAdv = leagueAvg×homeAdv ✓
  const HOME_ADV = 1.08; // Slight edge for the "home" team in WC schedules
  let lambdaH = (hStr.attack * aStr.defense) / LEAGUE_AVG_XG * HOME_ADV;
  let lambdaA = (aStr.attack * hStr.defense) / LEAGUE_AVG_XG;

  // ── WEATHER ADJUSTMENT ───────────────────────────────────────────────────
  const hWeather = weatherImpact(weather, home);
  const aWeather = weatherImpact(weather, away);
  lambdaH *= (1 + hWeather);
  lambdaA *= (1 + aWeather);

  // ── LIVE PLAYER STATS ADJUSTMENT (partial-tournament signal) ─────────────
  if (playerStats && (playerStats.homeGP || 0) >= 1) {
    const hGpg = (playerStats.homeGoals || 0) / Math.max(1, playerStats.homeGP);
    const aGpg = (playerStats.awayGoals || 0) / Math.max(1, playerStats.awayGP || 2);
    // Blend weight grows with sample size: 1 game → 20%, 3 games → 40%
    const blendW = Math.min(0.40, (playerStats.homeGP / 3) * 0.40);
    lambdaH = (1 - blendW) * lambdaH + blendW * hGpg;
    lambdaA = (1 - blendW) * lambdaA + blendW * aGpg;
  }

  // ── BOOKMAKER LINE CALIBRATION ───────────────────────────────────────────
  // When O/U is available, scale λ total to match market's expected goal count.
  // When handicap is available, shift the λ split proportionally.
  let usedHandicap = handicap, usedTotal = totalLine;
  if (usedTotal !== null) {
    const currentTotal = lambdaH + lambdaA;
    const scale = usedTotal / currentTotal;
    lambdaH *= scale;
    lambdaA *= scale;
  }
  if (usedHandicap !== null) {
    // Each 0.5 handicap unit ≈ 0.18 goal difference
    const spread = Math.abs(usedHandicap) * 0.18;
    if (usedHandicap < 0) { lambdaH += spread / 2; lambdaA -= spread / 2; }
    else if (usedHandicap > 0) { lambdaA += spread / 2; lambdaH -= spread / 2; }
  }

  // Tournament pressure (desperation attack boost)
  if (context.homeMustWin) lambdaH *= 1.06;
  if (context.awayMustWin) lambdaA *= 1.06;

  // Clamp to realistic range
  lambdaH = Math.max(0.25, Math.min(5.5, lambdaH));
  lambdaA = Math.max(0.25, Math.min(5.5, lambdaA));

  // ── POISSON SCORE MATRIX ─────────────────────────────────────────────────
  const poisson = poissonMatchProbs(lambdaH, lambdaA);

  // ── ELO WIN PROBABILITY ──────────────────────────────────────────────────
  // P(home wins) from pure Elo — excludes draw probability
  // Use Poisson draw fraction to split the Elo signal into 1X2
  const eloWinP = 1 / (1 + Math.pow(10, (aElo - hElo + 30) / 400));
  const eloDrawFrac = poisson.draw;
  const eloHome = eloWinP * (1 - eloDrawFrac);
  const eloAway = (1 - eloWinP) * (1 - eloDrawFrac);

  // ── BOOKMAKER MARKET ODDS ────────────────────────────────────────────────
  let mktHome = null, mktDraw = null, mktAway = null;
  if (odds) {
    const hOdds = odds[home] || odds[Object.keys(odds).find(k => k !== 'Draw' && k !== away)];
    const aOdds = odds[away] || odds[Object.keys(odds).find(k => k !== 'Draw' && k !== home)];
    const dOdds = odds['Draw'];
    if (hOdds && aOdds && dOdds) {
      const rh = 1/hOdds, rd = 1/dOdds, ra = 1/aOdds, tot = rh+rd+ra;
      mktHome = rh/tot; mktDraw = rd/tot; mktAway = ra/tot;
    }
  }

  // ── FINAL PROBABILITY BLEND ──────────────────────────────────────────────
  // With market: 55% Poisson + 40% market + 5% Elo
  // Without:     82% Poisson + 18% Elo
  let fHome, fDraw, fAway;
  if (mktHome !== null) {
    fHome = 0.55 * poisson.home + 0.40 * mktHome + 0.05 * eloHome;
    fDraw = 0.55 * poisson.draw + 0.40 * mktDraw + 0.05 * eloDrawFrac;
    fAway = 0.55 * poisson.away + 0.40 * mktAway + 0.05 * eloAway;
  } else {
    fHome = 0.82 * poisson.home + 0.18 * eloHome;
    fDraw = 0.82 * poisson.draw + 0.18 * eloDrawFrac;
    fAway = 0.82 * poisson.away + 0.18 * eloAway;
  }

  // ── H2H MODIFIER (±3% max, Bayesian-smoothed) ───────────────────────────
  if (h2h && h2h.matches >= 3) {
    // Smooth with pseudo-counts to avoid overfitting small samples
    const smoothRate = (h2h.homeWins + 1) / (h2h.matches + 3) - (h2h.awayWins + 1) / (h2h.matches + 3);
    const adj = smoothRate * 0.055;
    fHome += adj; fAway -= adj * 0.75;
  }

  // ── SOCIAL MOMENTUM (minor ±0.5%) ────────────────────────────────────────
  const hSocial = socialMomentum(home), aSocial = socialMomentum(away);
  fHome += hSocial * 0.08; fAway += aSocial * 0.08;

  // Normalise to [0,1]
  const tot = fHome + fDraw + fAway || 1;
  fHome /= tot; fDraw /= tot; fAway /= tot;

  // ── PREDICTED SCORE ──────────────────────────────────────────────────────
  // Primary: most likely scoreline from Poisson matrix (Dixon-Coles adjusted)
  let predHome = poisson.mlHome, predAway = poisson.mlAway;

  // Sanity-check direction against final win probability
  if (fHome > 0.60 && predHome <= predAway) predHome = predAway + 1;
  if (fAway > 0.60 && predAway <= predHome) predAway = predHome + 1;
  if (fDraw > fHome && fDraw > fAway) {
    const avg = Math.round((predHome + predAway) / 2);
    predHome = avg; predAway = avg;
  }

  // ── CONFIDENCE & UPSET RISK ──────────────────────────────────────────────
  const spread = Math.abs(fHome - fAway);
  const confidence = spread > 0.42 ? 5 : spread > 0.32 ? 4 : spread > 0.20 ? 3 : spread > 0.10 ? 2 : 1;

  const rankFavorite = homeRank < awayRank ? "home" : "away";
  const upsetRisk    = (rankFavorite === "home" ? fAway : fHome) > 0.28;
  const isLowConf    = spread < 0.15;

  // Effective handicap (for factors display)
  const effectiveHandicap = usedHandicap !== null ? usedHandicap
    : -(fHome - fAway) / 0.065;

  return {
    home, away,
    predictedHome: predHome,
    predictedAway: predAway,
    homeWinProb:  Math.round(fHome * 100),
    drawProb:     Math.round(fDraw * 100),
    awayWinProb:  Math.round(fAway * 100),
    confidence,
    upsetRisk,
    weather,
    venue,
    lowConfidenceMode: isLowConf,
    factors: {
      // Bookmaker market (most trusted single signal)
      odds: mktHome !== null ? {
        home: Math.round(mktHome * 100), away: Math.round(mktAway * 100),
        weight: 0.40,
      } : null,

      // Handicap (bookmaker line or derived)
      handicap: {
        line: +effectiveHandicap.toFixed(2),
        home: Math.round(fHome * 100), away: Math.round(fAway * 100),
        weight: 0, derived: usedHandicap === null,
      },

      // Dixon-Coles Poisson model outputs
      xg: {
        home: Math.round(poisson.home * 100), away: Math.round(poisson.away * 100),
        weight: 0.55,
      },
      poisson: {
        lambdaHome: +lambdaH.toFixed(2), lambdaAway: +lambdaA.toFixed(2),
        homeWin: Math.round(poisson.home * 100),
        draw:    Math.round(poisson.draw * 100),
        awayWin: Math.round(poisson.away * 100),
        mostLikelyScore: `${poisson.mlHome}-${poisson.mlAway}`,
        weight: 0.55,
      },

      // Elo ratings
      elo: {
        home: Math.round(hElo), away: Math.round(aElo),
        homeWinProb: Math.round(eloWinP * 100),
        weight: 0.05,
      },

      // Attack/defense Bayesian parameters
      attackDefense: {
        homeAttack:  +hStr.attack.toFixed(2),
        homeDefense: +hStr.defense.toFixed(2),
        awayAttack:  +aStr.attack.toFixed(2),
        awayDefense: +aStr.defense.toFixed(2),
        leagueAvg:   +LEAGUE_AVG_XG.toFixed(2),
        homeGames:   hStr.games, awayGames: aStr.games,
      },

      // Legacy fields (UI compatibility)
      ranking: { home: homeRank, away: awayRank, weight: 0 },
      form: {
        home: `${homeForm.pts}pts/${homeForm.played}g`,
        away: `${awayForm.pts}pts/${awayForm.played}g`,
        weight: 0,
      },
      depth: {
        home: lookupNorm(SQUAD_DEPTH, home) ?? 5,
        away: lookupNorm(SQUAD_DEPTH, away) ?? 5,
        weight: 0,
      },
      attack: playerStats ? {
        home: +((playerStats.homeGoals||0) / Math.max(1, playerStats.homeGP||2)).toFixed(2),
        away: +((playerStats.awayGoals||0) / Math.max(1, playerStats.awayGP||2)).toFixed(2),
        homeTotal: playerStats.homeGoals, awayTotal: playerStats.awayGoals, weight: 0,
      } : null,
      weather:  { condition: weather.condition, temp: weather.temp, weight: 0 },
      social:   { home: SOCIAL_BUZZ[home]||30, away: SOCIAL_BUZZ[away]||30, weight: 0 },
    },
    homeForm, awayForm,
  };
}

module.exports = { predict, getTeamForm, normName, FIFA_RANKINGS, TEAM_STRENGTHS, ELO_RATINGS, LEAGUE_AVG_XG, WC2022_RESULTS, WC_RESULTS, SQUAD_DEPTH, fetchWeather, weatherImpact, poissonMatchProbs };
