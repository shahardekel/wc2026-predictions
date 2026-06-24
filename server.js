const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const path = require("path");
const { predict, normName, getTeamForm, FIFA_RANKINGS, TEAM_STRENGTHS, ELO_RATINGS, LEAGUE_AVG_XG, WC2022_RESULTS, WC_RESULTS, SQUAD_DEPTH, fetchWeather, weatherImpact, poissonMatchProbs } = require("./predictor");

const app = express();
const PORT = 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ODDS_API_KEY = process.env.ODDS_API_KEY || "YOUR_ODDS_KEY";
const ODDS_BASE    = "https://api.the-odds-api.com/v4";
const SPORT        = "soccer_fifa_world_cup";
const ESPN_BASE    = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

// Venue mapping: match teams to stadium city
const VENUES = {
  "Portugal-Uzbekistan":"Houston","England-Ghana":"Boston",
  "Panama-Croatia":"Toronto","Colombia-Congo DR":"Guadalajara",
  "Colombia-DR Congo":"Guadalajara","Switzerland-Canada":"Vancouver",
  "Bosnia-Qatar":"Seattle","Scotland-Brazil":"Miami",
  "Morocco-Haiti":"Atlanta","Czechia-Mexico":"Mexico City",
  "South Africa-South Korea":"Monterrey","Ecuador-Germany":"New York",
  "Curaçao-Ivory Coast":"Philadelphia","Japan-Sweden":"Dallas",
  "Tunisia-Netherlands":"Kansas City","Paraguay-Australia":"San Francisco",
  "Turkey-USA":"Los Angeles","Norway-France":"Boston",
  "Senegal-Iraq":"Toronto","Cape Verde-Saudi Arabia":"Houston",
  "Uruguay-Spain":"Guadalajara","Egypt-Iran":"Seattle",
  "New Zealand-Belgium":"Vancouver","Croatia-Ghana":"Philadelphia",
  "Panama-England":"New York","Colombia-Portugal":"Miami",
  "Congo DR-Uzbekistan":"Atlanta","Algeria-Austria":"Kansas City",
  "Jordan-Argentina":"Dallas",
};

let oddsCache    = { data:null, ts:0 };
let scoresCache  = { data:null, ts:0 };
let predCache    = {};  // team pair → prediction
let summaryCache = {};  // espnId → { data, ts }
let rosterCache  = {};  // espnTeamId → { data, ts }
let teamsCache   = { data:null, ts:0 };
let photoCache   = {};  // playerName → { url, ts }
const ODDS_TTL    = 90000;
const SCORES_TTL  = 120000;
const PRED_TTL    = 600000;
const SUMMARY_TTL = 600000;
const ROSTER_TTL  = 600000;
const TEAMS_TTL   = 3600000; // 1 hour — team list rarely changes

const FORMATIONS = {
  "Spain":"4-3-3","France":"4-3-3","England":"4-2-3-1","Germany":"4-2-3-1",
  "Brazil":"4-4-2","Argentina":"4-3-3","Portugal":"4-3-3","Netherlands":"4-3-3",
  "Belgium":"3-4-3","Croatia":"4-3-3","Norway":"4-3-3","Colombia":"4-2-3-1",
  "Mexico":"4-3-3","USA":"4-3-3","Uruguay":"4-4-2","Japan":"4-2-3-1",
  "Morocco":"4-3-3","Senegal":"4-2-3-1","Australia":"4-3-3","South Korea":"4-2-3-1",
  "Egypt":"4-2-3-1","Austria":"4-3-3","Switzerland":"4-2-3-1","Canada":"4-3-3",
  "Ecuador":"4-3-3","Ghana":"4-2-3-1","Ivory Coast":"4-3-3","Scotland":"4-3-3",
  "Sweden":"4-4-2","Tunisia":"4-3-3","Turkey":"4-3-3","Türkiye":"4-3-3",
  "Algeria":"4-3-3","Saudi Arabia":"4-2-3-1","Iran":"4-2-3-1","Qatar":"4-3-3",
  "Paraguay":"4-4-2","Panama":"5-4-1","Haiti":"4-4-2","Jordan":"4-4-2",
  "Uzbekistan":"4-3-3","Cape Verde":"4-3-3","Bosnia & Herzegovina":"4-3-3",
  "DR Congo":"4-3-3","Congo DR":"4-3-3","Czechia":"4-2-3-1","New Zealand":"4-3-3",
  "South Africa":"4-1-4-1","Iraq":"4-3-3","Curaçao":"4-4-2",
};

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────
app.get("/api/odds", async (req, res) => {
  try {
    const [oddsResult, espnMatches] = await Promise.all([getOdds(), getESPN()]);
    const games = buildGameList(oddsResult.games, espnMatches);

    // Enrich upcoming games with algorithm predictions
    const enriched = await enrichWithPredictions(games);

    res.json({
      source: oddsResult.source,
      games: enriched,
      quota: oddsResult.quota,
      scoresSource: espnMatches.length ? "espn" : "none",
    });
  } catch(err) {
    console.error("Error:", err.message);
    res.json({ source:"error", games:[] });
  }
});

// On-demand prediction for any matchup
app.get("/api/predict/:home/:away", async (req, res) => {
  try {
    const { home, away } = req.params;
    const venue = req.query.venue || "Dallas";
    const result = await predict(home, away, venue);
    res.json(result);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PREDICTIONS ENRICHMENT ───────────────────────────────────────────────
async function enrichWithPredictions(games) {
  const now = Date.now();

  return Promise.all(games.map(async g => {
    if (g.status === "finished" || g.status === "live") return g;

    const cacheKey = `${normName(g.home)}-${normName(g.away)}`;
    if (predCache[cacheKey] && now - predCache[cacheKey].ts < PRED_TTL)
      return { ...g, prediction: predCache[cacheKey].data };

    try {
      const venue = VENUES[`${g.home}-${g.away}`] || VENUES[`${g.away}-${g.home}`] || "Dallas";

      // Fetch ESPN summary + rosters in parallel
      const [summary, homeRoster, awayRoster] = await Promise.all([
        getESPNSummary(g.espnId || g.id),
        g.homeEspnTeamId ? getTeamRoster(g.homeEspnTeamId) : Promise.resolve(null),
        g.awayEspnTeamId ? getTeamRoster(g.awayEspnTeamId) : Promise.resolve(null),
      ]);
      const context = deriveContext(summary, g.home, g.away);
      const handicap  = summary?.spread    ?? g.handicap  ?? null;
      const totalLine = summary?.overUnder  ?? g.totalLine ?? null;

      const playerStats = (homeRoster || awayRoster) ? {
        homeGoals: homeRoster?.teamGoals ?? 0,
        homeAssists: homeRoster?.teamAssists ?? 0,
        homeGP: homeRoster?.gamesPlayed ?? 2,
        awayGoals: awayRoster?.teamGoals ?? 0,
        awayAssists: awayRoster?.teamAssists ?? 0,
        awayGP: awayRoster?.gamesPlayed ?? 2,
      } : null;

      if (summary) {
        const flags = [];
        if (handicap  != null) flags.push(`spread:${handicap>0?'+':''}${handicap}`);
        if (totalLine != null) flags.push(`O/U:${totalLine}`);
        if (playerStats) flags.push(`goals:${playerStats.homeGoals}–${playerStats.awayGoals}`);
        if (Object.keys(context).length) flags.push(`ctx:${JSON.stringify(context)}`);
        if (flags.length) console.log(`  📐 ${g.home} vs ${g.away} — ${flags.join(' | ')}`);
      }

      const pred = await predict(g.home, g.away, venue, context, g.odds || {}, handicap, totalLine, playerStats);
      predCache[cacheKey] = { data: pred, ts: now };
      return { ...g, prediction: pred, summary: summary ? {
        spread: handicap, overUnder: totalLine,
        standings: summary.standings,
        context,
      } : undefined };
    } catch(e) {
      console.error(`Prediction error for ${g.home} vs ${g.away}:`, e.message);
      return g;
    }
  }));
}

// ─── ODDS FETCHER ────────────────────────────────────────────────────────────
async function getOdds() {
  const now = Date.now();
  if (oddsCache.data && now - oddsCache.ts < ODDS_TTL)
    return { source:"cache", ...oddsCache.data };
  if (ODDS_API_KEY === "YOUR_ODDS_KEY")
    return { source:"mock", games:[] };
  try {
    const url = `${ODDS_BASE}/sports/${SPORT}/odds/?apiKey=${ODDS_API_KEY}&regions=eu,uk,us&markets=h2h&oddsFormat=decimal&dateFormat=iso`;
    const r = await fetch(url);
    if (!r.ok) { console.error("Odds API:", r.status); return { source:"error", games:[] }; }
    const raw = await r.json();
    const remaining = r.headers.get("x-requests-remaining")||"?";
    const used = r.headers.get("x-requests-used")||"?";
    const games = transformOdds(raw);
    oddsCache = { data:{ games, quota:{remaining,used} }, ts:now };
    return { source:"live", games, quota:{remaining,used} };
  } catch(e) {
    console.error("Odds error:", e.message);
    return { source:"error", games:[] };
  }
}

// ─── ESPN FETCHER ────────────────────────────────────────────────────────────
async function getESPN() {
  const now = Date.now();
  if (scoresCache.data && now - scoresCache.ts < SCORES_TTL)
    return scoresCache.data;

  const today = new Date();
  // Fetch all dates in PARALLEL — much faster than sequential
  const dates = [];
  for (let d = -14; d <= 14; d++) {
    dates.push(new Date(today.getTime() + d*86400000).toISOString().slice(0,10).replace(/-/g,""));
  }

  const fetchDate = async (date) => {
    try {
      const r = await fetch(`${ESPN_BASE}?dates=${date}`, {
        headers: {"User-Agent":"Mozilla/5.0"},
        timeout: 4000,
      });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.events||[]).map(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return null;
        const home = comp.competitors?.find(c => c.homeAway==="home");
        const away = comp.competitors?.find(c => c.homeAway==="away");
        return {
          id: ev.id, utcDate: ev.date,
          homeTeam: home?.team?.displayName,
          awayTeam: away?.team?.displayName,
          homeEspnTeamId: home?.team?.id,
          awayEspnTeamId: away?.team?.id,
          homeScore: home?.score!=null ? parseInt(home.score) : null,
          awayScore: away?.score!=null ? parseInt(away.score) : null,
          status: mapStatus(ev.status?.type?.name),
          clock: ev.status?.displayClock,
        };
      }).filter(Boolean);
    } catch(_) { return []; }
  };

  // Fire all 29 requests at once
  const results = await Promise.all(dates.map(fetchDate));
  const allMatches = results.flat();

  const seen = new Set();
  const unique = allMatches.filter(m => {
    const k = `${m.homeTeam}-${m.awayTeam}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  const finished = unique.filter(m=>m.status==="FINISHED");
  const live = unique.filter(m=>m.status==="IN_PLAY");
  console.log(`📊 ESPN: ${unique.length} matches | ✅ ${finished.length} finished | 🔴 ${live.length} live`);

  scoresCache = { data:unique, ts:now };
  return unique;
}

function mapStatus(s) {
  if (!s) return "SCHEDULED";
  if (s==="STATUS_FINAL"||s==="STATUS_FULL_TIME") return "FINISHED";
  if (s==="STATUS_IN_PROGRESS"||s==="STATUS_HALFTIME"||s==="STATUS_END_PERIOD") return "IN_PLAY";
  return "SCHEDULED";
}

// ─── ESPN SUMMARY (spread, O/U, standings, last-5) ───────────────────────────
async function getESPNSummary(espnId) {
  if (!espnId) return null;
  const now = Date.now();
  if (summaryCache[espnId] && now - summaryCache[espnId].ts < SUMMARY_TTL)
    return summaryCache[espnId].data;

  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=${espnId}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 4000 }
    );
    if (!r.ok) return null;
    const d = await r.json();

    // ── Pickcenter (spread + O/U + money line) ──
    const pc = d.pickcenter?.[0];
    const spread    = pc?.spread    ?? null;  // home team handicap (negative = favored)
    const overUnder = pc?.overUnder ?? null;
    const homeML    = pc?.homeTeamOdds?.moneyLine ?? null;
    const awayML    = pc?.awayTeamOdds?.moneyLine ?? null;

    // Convert American ML → implied win prob (2-way, no draw)
    const mlToProb = ml => ml == null ? null : ml > 0 ? 100/(ml+100) : (-ml)/((-ml)+100);
    const homeMLProb = mlToProb(homeML);
    const awayMLProb = mlToProb(awayML);

    // ── Group standings for both teams ──
    const entries = d.standings?.groups?.[0]?.standings?.entries || [];
    const parseEntry = e => {
      const s = name => e.stats?.find(s => s.name === name)?.value ?? null;
      return { team: e.team, rank: s("rank"), pts: s("points"), gp: s("gamesPlayed"), gd: s("pointDifferential") };
    };
    const standings = entries.map(parseEntry);

    // ── Last-5 game results ──
    const last5 = {};
    (d.lastFiveGames || []).forEach(t => {
      const wins   = (t.events||[]).filter(e => e.result === "W").length;
      const draws  = (t.events||[]).filter(e => e.result === "T").length;
      const losses = (t.events||[]).filter(e => e.result === "L").length;
      last5[t.team?.displayName] = { wins, draws, losses, played: t.events?.length || 0 };
    });

    const result = { spread, overUnder, homeMLProb, awayMLProb, standings, last5 };
    summaryCache[espnId] = { data: result, ts: now };
    return result;
  } catch(e) {
    console.error(`ESPN summary ${espnId}:`, e.message);
    return null;
  }
}

// Derive tournament context from group standings
function deriveContext(summary, homeTeam, awayTeam) {
  if (!summary?.standings?.length) return {};
  const find = name => summary.standings.find(e =>
    normName(e.team) === normName(name) ||
    (typeof e.team === "object" && normName(e.team.displayName||"") === normName(name))
  );
  const h = find(homeTeam), a = find(awayTeam);
  if (!h || !a) return {};

  const context = {};
  // Matchday 3 (gp=2): stakes are highest
  if (h.gp === 2) {
    if (h.rank >= 3 && h.pts <= 1) context.homeMustWin = true;
    else if (h.rank <= 2 && h.pts >= 4) context.homeCanDraw = true;
  }
  if (a.gp === 2) {
    if (a.rank >= 3 && a.pts <= 1) context.awayMustWin = true;
    else if (a.rank <= 2 && a.pts >= 4) context.awayCanDraw = true;
  }
  return context;
}

// ─── MERGE ESPN + ODDS ────────────────────────────────────────────────────────
function buildGameList(oddsGames, espnMatches) {
  const result = [];
  const usedESPN = new Set();

  for (const og of oddsGames) {
    const espn = espnMatches.find(m =>
      teamNamesMatch(m.homeTeam, og.home) && teamNamesMatch(m.awayTeam, og.away)
    );
    if (espn) {
      usedESPN.add(espn.id);
      result.push(mergeGame(og, espn));
    } else {
      result.push(og);
    }
  }

  for (const m of espnMatches) {
    if (usedESPN.has(m.id)) continue;
    if (m.status!=="FINISHED" && m.status!=="IN_PLAY") continue;
    if (!m.homeTeam || m.homeTeam.includes("Place") || m.homeTeam.includes("Winner")) continue;
    result.push({
      id: m.id, home:m.homeTeam, away:m.awayTeam,
      homeFlag:flagFor(m.homeTeam), awayFlag:flagFor(m.awayTeam),
      commence:m.utcDate, bookmakerCount:0, odds:{},
      status: m.status==="FINISHED"?"finished":"live",
      homeScore:m.homeScore, awayScore:m.awayScore,
      result: m.status==="FINISHED"?`${m.homeScore} – ${m.awayScore}`:null,
      liveScore: m.status==="IN_PLAY"?`${m.homeScore??0} – ${m.awayScore??0}`:null,
      liveMinute:m.clock,
    });
  }

  return result.sort((a,b) => {
    const o={live:0,soon:1,upcoming:2,finished:3};
    if (o[a.status]!==o[b.status]) return o[a.status]-o[b.status];
    return new Date(a.commence)-new Date(b.commence);
  });
}

function mergeGame(og, espn) {
  const g = { ...og, espnId: espn.id, homeEspnTeamId: espn.homeEspnTeamId, awayEspnTeamId: espn.awayEspnTeamId };
  if (espn.status==="FINISHED") {
    g.status="finished"; g.homeScore=espn.homeScore; g.awayScore=espn.awayScore;
    g.result=`${espn.homeScore} – ${espn.awayScore}`;
  } else if (espn.status==="IN_PLAY") {
    g.status="live"; g.liveScore=`${espn.homeScore??0} – ${espn.awayScore??0}`;
    g.liveMinute=espn.clock; g.homeScore=espn.homeScore; g.awayScore=espn.awayScore;
  }
  return g;
}

function teamNamesMatch(a, b) {
  if (!a||!b) return false;
  const n = s => s.toLowerCase()
    .replace(/united states.*/gi,"usa").replace(/congo dr|dr congo/gi,"congo")
    .replace(/cabo verde|cape verde/gi,"cape verde").replace(/türkiye|turkey/gi,"turkey")
    .replace(/côte d.ivoire|ivory coast/gi,"ivory coast").replace(/czechia|czech republic/gi,"czech")
    .replace(/korea republic|south korea/gi,"korea").replace(/ir iran/gi,"iran")
    .replace(/bosnia.*/gi,"bosnia").replace(/[^a-z0-9 ]/g,"").replace(/\s+/g," ").trim();
  const na=n(a),nb=n(b);
  return na===nb||na.includes(nb)||nb.includes(na);
}

// ─── ODDS TRANSFORM ───────────────────────────────────────────────────────────
function transformOdds(raw) {
  return raw.map(game => {
    const bks = game.bookmakers||[];

    // h2h: average price per outcome across bookmakers
    const h2hMap = {};
    bks.forEach(bk => {
      const mkt = (bk.markets||[]).find(m=>m.key==="h2h");
      if (!mkt) return;
      mkt.outcomes.forEach(o => { if (!h2hMap[o.name]) h2hMap[o.name]=[]; h2hMap[o.name].push(o.price); });
    });
    const odds = {};
    Object.entries(h2hMap).forEach(([k,v]) => { odds[k]=+(v.reduce((a,b)=>a+b,0)/v.length).toFixed(2); });

    // handicap and totals not available for this sport — derived from h2h spread instead
    const handicap = null, totalLine = null;

    return {
      id:game.id, home:game.home_team, away:game.away_team,
      commence:game.commence_time, bookmakerCount:bks.length,
      odds, handicap, totalLine,
      homeFlag:flagFor(game.home_team), awayFlag:flagFor(game.away_team),
      status:getStatus(game.commence_time),
    };
  }).sort((a,b)=>new Date(a.commence)-new Date(b.commence));
}

function getStatus(c) {
  const d=new Date(c).getTime()-Date.now();
  if (d<0&&d>-110*60000) return "live";
  if (d<0) return "finished";
  if (d<172800000) return "soon";
  return "upcoming";
}

const FLAGS = {
  "France":"🇫🇷","Spain":"🇪🇸","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Germany":"🇩🇪","Brazil":"🇧🇷",
  "Argentina":"🇦🇷","Portugal":"🇵🇹","Netherlands":"🇳🇱","Norway":"🇳🇴","Belgium":"🇧🇪",
  "Croatia":"🇭🇷","Uruguay":"🇺🇾","Colombia":"🇨🇴","Mexico":"🇲🇽","USA":"🇺🇸",
  "United States":"🇺🇸","Japan":"🇯🇵","Morocco":"🇲🇦","Senegal":"🇸🇳","Australia":"🇦🇺",
  "South Korea":"🇰🇷","Korea":"🇰🇷","Iran":"🇮🇷","Saudi Arabia":"🇸🇦","Ghana":"🇬🇭",
  "Egypt":"🇪🇬","Cape Verde":"🇨🇻","Uzbekistan":"🇺🇿","DR Congo":"🇨🇩","Congo":"🇨🇩",
  "Panama":"🇵🇦","New Zealand":"🇳🇿","Austria":"🇦🇹","Switzerland":"🇨🇭","Algeria":"🇩🇿",
  "Jordan":"🇯🇴","Iraq":"🇮🇶","Sweden":"🇸🇪","Scotland":"🏴󠁧󠁢󠁳󠁣󠁴󠁿","Canada":"🇨🇦",
  "Tunisia":"🇹🇳","Ecuador":"🇪🇨","Paraguay":"🇵🇾","Turkey":"🇹🇷","Türkiye":"🇹🇷",
  "Qatar":"🇶🇦","Bosnia":"🇧🇦","South Africa":"🇿🇦","Czech":"🇨🇿","Haiti":"🇭🇹",
  "Curaçao":"🇨🇼","Curacao":"🇨🇼","Ivory Coast":"🇨🇮","Cote d'Ivoire":"🇨🇮",
};
function flagFor(n) {
  if (!n) return "🏳️";
  for (const [k,f] of Object.entries(FLAGS)) if (n.toLowerCase().includes(k.toLowerCase())) return f;
  return "🏳️";
}

// ─── PLAYER PHOTO (TheSportsDB) ──────────────────────────────────────────────
app.get("/api/player-photo/:name", async (req, res) => {
  const name = req.params.name;
  const now = Date.now();
  if (photoCache[name] && now - photoCache[name].ts < 86400000)
    return res.json(photoCache[name].data);
  try {
    const r = await fetch(
      `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 3000 }
    );
    const d = await r.json();
    const p = d.player?.[0];
    const url = p?.strCutout || p?.strThumb || null;
    photoCache[name] = { data: { url }, ts: now };
    res.json({ url });
  } catch(e) {
    res.json({ url: null });
  }
});

// ─── ALGORITHM DATA ──────────────────────────────────────────────────────────
app.get("/api/algo-data", (req, res) => {
  // Build sorted team strength array for visualizations
  const teamStrengths = Object.entries(TEAM_STRENGTHS)
    .map(([nn, s]) => ({
      nn,
      attack:       +s.attack.toFixed(3),
      defense:      +s.defense.toFixed(3),
      priorAttack:  +s.priorAttack.toFixed(3),
      priorDefense: +s.priorDefense.toFixed(3),
      games:        s.games,
    }))
    .sort((a, b) => b.attack - a.attack);

  // Build Elo array (find display name from FIFA_RANKINGS)
  const nameByNorm = {};
  for (const k of Object.keys(FIFA_RANKINGS)) {
    const nn = normName(k);
    if (!nameByNorm[nn]) nameByNorm[nn] = k;
  }
  const eloRatings = Object.entries(ELO_RATINGS)
    .map(([nn, elo]) => ({ name: nameByNorm[nn] || nn, nn, elo: Math.round(elo) }))
    .sort((a, b) => b.elo - a.elo);

  res.json({
    leagueAvg: +LEAGUE_AVG_XG.toFixed(3),
    teamStrengths,
    eloRatings,
    wc2026Count: WC_RESULTS.length,
    wc2022Count: WC2022_RESULTS.length,
    dcRho: -0.028,
    homeAdv: 1.08,
    blend: { poisson: 0.55, market: 0.40, elo: 0.05 },
  });
});

// ─── LAMBDA ENDPOINT (full server-side Poisson λ for heatmap) ────────────────
app.get("/api/lambda", async (req, res) => {
  try {
    const home = req.query.home || "France";
    const away = req.query.away || "England";
    const hn = normName(home), an = normName(away);

    const hStr = TEAM_STRENGTHS[hn] || { attack: LEAGUE_AVG_XG, defense: LEAGUE_AVG_XG };
    const aStr = TEAM_STRENGTHS[an] || { attack: LEAGUE_AVG_XG, defense: LEAGUE_AVG_XG };

    const HOME_ADV = 1.08;
    let lH = (hStr.attack * aStr.defense) / LEAGUE_AVG_XG * HOME_ADV;
    let lA = (aStr.attack * hStr.defense) / LEAGUE_AVG_XG;

    // Apply weather adjustment using scheduled venue if known
    const venueKey = Object.keys(VENUES).find(k =>
      normName(k.split('-')[0]) === hn && normName(k.split('-')[1]) === an ||
      normName(k.split('-')[0]) === an && normName(k.split('-')[1]) === hn
    );
    const venue = venueKey ? VENUES[venueKey] : "Dallas";
    const weather = await fetchWeather(venue);
    lH *= (1 + weatherImpact(weather, home));
    lA *= (1 + weatherImpact(weather, away));

    lH = Math.max(0.25, Math.min(5, lH));
    lA = Math.max(0.25, Math.min(5, lA));

    const poisson = poissonMatchProbs(lH, lA);

    // Elo blend (no market odds): 82% Poisson + 18% Elo
    const hElo = ELO_RATINGS[hn] ?? 1550;
    const aElo = ELO_RATINGS[an] ?? 1550;
    const eloDiff = hElo + 30 - aElo;
    const eloHome = 1 / (1 + Math.pow(10, -eloDiff / 400));
    const eloAway = (1 - eloHome) * 0.65;
    const eloDraw = 1 - eloHome - eloAway;
    const blendHome = +(0.82 * poisson.home + 0.18 * eloHome).toFixed(3);
    const blendDraw = +(0.82 * poisson.draw + 0.18 * eloDraw).toFixed(3);
    const blendAway = +(0.82 * poisson.away + 0.18 * eloAway).toFixed(3);

    res.json({
      lambdaHome: +lH.toFixed(3),
      lambdaAway: +lA.toFixed(3),
      home: +poisson.home.toFixed(3),
      draw: +poisson.draw.toFixed(3),
      away: +poisson.away.toFixed(3),
      blendHome, blendDraw, blendAway,
      venue,
      weather: weather ? { temp: weather.temp, condition: weather.condition } : null,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TEAMS LIST ──────────────────────────────────────────────────────────────
app.get("/api/teams", async (req, res) => {
  try {
    const now = Date.now();
    if (teamsCache.data && now - teamsCache.ts < TEAMS_TTL)
      return res.json(teamsCache.data);

    const r = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams?limit=100",
      { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 5000 }
    );
    if (!r.ok) return res.status(502).json({ error: "ESPN unavailable" });
    const d = await r.json();

    const teams = (d.sports?.[0]?.leagues?.[0]?.teams || []).map(t => {
      const form = getTeamForm(t.team.displayName);
      const rank = FIFA_RANKINGS[t.team.displayName] || FIFA_RANKINGS[normName(t.team.displayName)] || 50;
      const formation = FORMATIONS[t.team.displayName] || "4-3-3";
      return {
        id: t.team.id,
        name: t.team.displayName,
        abbreviation: t.team.abbreviation,
        color: t.team.color,
        alternateColor: t.team.alternateColor,
        flag: flagFor(t.team.displayName),
        formation,
        fifaRank: rank,
        form,
      };
    }).sort((a, b) => a.fifaRank - b.fifaRank);

    const result = { teams };
    teamsCache = { data: result, ts: now };
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── TEAM ROSTER + STATS ─────────────────────────────────────────────────────
app.get("/api/team/:espnId", async (req, res) => {
  try {
    const data = await getTeamRoster(req.params.espnId);
    if (!data) return res.status(404).json({ error: "Team not found" });
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

async function getTeamRoster(espnTeamId) {
  if (!espnTeamId) return null;
  const now = Date.now();
  if (rosterCache[espnTeamId] && now - rosterCache[espnTeamId].ts < ROSTER_TTL)
    return rosterCache[espnTeamId].data;

  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/${espnTeamId}/roster`,
      { headers: { "User-Agent": "Mozilla/5.0" }, timeout: 5000 }
    );
    if (!r.ok) return null;
    const d = await r.json();

    const getStat = (categories, cat, name) => {
      const c = (categories||[]).find(s => s.name === cat);
      return c?.stats?.find(s => s.name === name)?.value ?? 0;
    };

    const athletes = d.athletes || [];
    const players = athletes.map(ath => {
      const cats = ath.statistics?.splits?.categories || [];
      return {
        id: ath.id,
        name: ath.displayName,
        shortName: ath.shortName || ath.displayName,
        jersey: ath.jersey || '-',
        position: ath.position?.abbreviation || '?',
        positionName: ath.position?.name || 'Unknown',
        age: ath.age || null,
        goals: getStat(cats, 'offensive', 'totalGoals'),
        assists: getStat(cats, 'offensive', 'goalAssists'),
        shots: getStat(cats, 'offensive', 'totalShots'),
        shotsOnTarget: getStat(cats, 'offensive', 'shotsOnTarget'),
        yellowCards: getStat(cats, 'general', 'yellowCards'),
        redCards: getStat(cats, 'general', 'redCards'),
        appearances: getStat(cats, 'general', 'appearances'),
        foulsCommitted: getStat(cats, 'general', 'foulsCommitted'),
        saves: getStat(cats, 'goalKeeping', 'saves'),
        goalsConceded: getStat(cats, 'goalKeeping', 'goalsConceded'),
      };
    }).sort((a, b) => (b.goals * 3 + b.assists + b.shotsOnTarget * 0.3) - (a.goals * 3 + a.assists + a.shotsOnTarget * 0.3));

    const teamGoals = players.reduce((s, p) => s + p.goals, 0);
    const teamAssists = players.reduce((s, p) => s + p.assists, 0);
    const teamShotsOnTarget = players.reduce((s, p) => s + p.shotsOnTarget, 0);
    const gamesPlayed = Math.max(...players.map(p => p.appearances), 1);

    const data = { players, teamGoals, teamAssists, teamShotsOnTarget, gamesPlayed };
    rosterCache[espnTeamId] = { data, ts: now };
    return data;
  } catch(e) {
    console.error(`Roster ${espnTeamId}:`, e.message);
    return null;
  }
}

const server = app.listen(PORT, () => {
  console.log(`\n⚽  WC2026 Multi-Factor Prediction Engine → http://localhost:${PORT}`);
  console.log(`   Algorithm: Odds (38%) + xG (18%) + FIFA rank (15%) + Form (12%) + Squad depth (8%) + Weather/Social/H2H (9%)\n`);
});
server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use. Run: kill $(lsof -ti:${PORT})\n`);
    process.exit(1);
  } else throw e;
});
