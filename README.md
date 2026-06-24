# ⚽ WC 2026 Live Odds Tracker

Real-time World Cup 2026 betting odds dashboard. Fetches live odds from 
multiple bookmakers, auto-refreshes every 60 seconds, and shows implied 
win probabilities with a clean dark UI.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd wc2026-odds
npm install
```

### 2. Get a free API key
Sign up at **https://the-odds-api.com**
- Free tier: **500 requests/month** (more than enough for personal use)
- No credit card required

### 3. Run the server

**Option A — with live odds:**
```bash
ODDS_API_KEY=your_key_here node server.js
```

**Option B — demo mode (no key needed):**
```bash
node server.js
```
This runs with mock data so you can see the UI working immediately.

### 4. Open the app
```
http://localhost:3000
```

---

## 🔄 Auto-refresh
- Odds auto-refresh every **60 seconds**
- The server caches API responses for 60s to protect your monthly quota
- With 500 free requests/month you can run it 24/7 for the whole tournament

---

## 🎛️ Features
- **Live, Soon, Upcoming, Finished** filters
- **Decimal + American odds** side by side
- **Implied win probability** bar for every match
- **Multi-bookmaker average** — aggregates odds from multiple books
- **API quota tracker** shows requests used/remaining
- Works with **The Odds API** (free tier)

---

## ⚙️ Optional: nodemon for auto-restart
```bash
npm install -g nodemon
ODDS_API_KEY=your_key nodemon server.js
```

---

## 📁 File Structure
```
wc2026-odds/
├── server.js          # Express backend + odds fetching + caching
├── public/
│   └── index.html     # Full frontend (single file, no build needed)
├── package.json
└── README.md
```

---

## 🔑 API Notes
- Sport key used: `soccer_fifa_world_cup`
- Markets: `h2h` (head-to-head / match result)
- Regions: `eu, uk, us` (European, British, American bookmakers)
- Odds format: `decimal`

---

## 🛠️ Customization
- Change `CACHE_TTL_MS` in `server.js` to control refresh rate
- Add more markets (over/under, BTTS) by updating the `markets=` param
- The flag mapping in `server.js` covers all 48 WC teams
