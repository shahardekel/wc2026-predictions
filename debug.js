const fetch = require("node-fetch");

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

async function main() {
  const today = new Date();
  const allMatches = [];

  for (let d = -14; d <= 14; d++) {
    const date = new Date(today.getTime() + d * 86400000)
      .toISOString().slice(0,10).replace(/-/g,"");
    try {
      const r = await fetch(`${ESPN_BASE}?dates=${date}`, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (!r.ok) continue;
      const data = await r.json();
      (data.events || []).forEach(ev => {
        const comp = ev.competitions?.[0];
        if (!comp) return;
        const home = comp.competitors?.find(c => c.homeAway === "home");
        const away = comp.competitors?.find(c => c.homeAway === "away");
        const status = ev.status?.type?.name;
        allMatches.push({
          date,
          status,
          home: home?.team?.displayName,
          away: away?.team?.displayName,
          score: `${home?.score ?? "?"}-${away?.score ?? "?"}`,
        });
      });
    } catch (_) {}
  }

  // Deduplicate
  const seen = new Set();
  const unique = allMatches.filter(m => {
    const k = `${m.home}-${m.away}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  console.log(`\nTotal: ${unique.length} matches\n`);
  unique.forEach(m => {
    console.log(`[${m.status?.replace("STATUS_","")}] ${m.home} vs ${m.away} → ${m.score}`);
  });
}

main();
