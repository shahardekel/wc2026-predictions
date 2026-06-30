# ⚽ WC 2026 AI Prediction Engine

Real-time World Cup 2026 prediction dashboard powered by a Dixon-Coles Poisson model with Bayesian team strength estimation, live ESPN data injection, shots-based xG, red card suspensions, and Bayesian Elo ratings. Auto-refreshes every 60 seconds with a clean dark UI and an interactive algorithm explorer.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Get a free API key (optional)
Sign up at **https://the-odds-api.com**
- Free tier: **500 requests/month**
- No credit card required
- The app runs fully without a key using ESPN data

### 3. Run the server

**Option A — with live bookmaker odds:**
```bash
ODDS_API_KEY=your_key_here node server.js
```

**Option B — ESPN-only mode (no key needed):**
```bash
node server.js
```

### 4. Open the app
```
http://localhost:3000
```

---

## 🧠 The Prediction Algorithm

The engine uses a multi-component probabilistic model that produces a full **10×10 score probability matrix** rather than a single win/loss prediction. All components are updated automatically from live ESPN match data after each game.

### Component Blend

| Component | Weight | Description |
|---|---|---|
| **Dixon-Coles Poisson** | 55% | Full score matrix with Bayesian team strength estimation |
| **Market Odds** | 40% | Consensus from bookmakers (de-vigged) — when available |
| **Bayesian Elo** | 5% | Live Elo ratings updated after each WC result |

Without bookmaker odds, the blend shifts to **82% Poisson + 18% Elo**.

### Dixon-Coles Poisson Model

The Poisson rate parameters λ are computed as a multiplicative attack/defense model:

```
λ_home = (attack_H × defense_A) / leagueAvg × 1.08  (home edge)
λ_away = (attack_A × defense_H) / leagueAvg
```

The full score probability for each cell (i, j) is:

```
P(i,j) = Poisson(λ_home, i) × Poisson(λ_away, j) × τ(i,j)
```

Where τ is the Dixon-Coles low-score correlation correction (ρ = −0.028):

```
τ(0,0) = 1 − λ_h·λ_a·ρ
τ(1,0) = 1 + λ_a·ρ
τ(0,1) = 1 + λ_h·ρ
τ(1,1) = 1 − ρ
τ(i,j) = 1  for i+j ≥ 2
```

The predicted score is the **modal cell** — the single highest-probability scoreline in the matrix.

### Bayesian Team Strength Estimation

Each team's attack and defense parameters are estimated via Bayesian posterior updating:

- **Prior**: derived from FIFA ranking + squad depth score
- **Likelihood**: WC xG (expected goals) data per game
- **Posterior blend weight**: `obsW = 1 − 1/(1 + n × 0.70)` where n is effective game count
- **Training data**: WC 2026 results (weight 1.0×) + WC 2022 results (weight 0.25×) — 100+ matches
- Exponential decay applied by recency position within each tournament

```
attack_posterior  = obsW × mean(xG_scored)  + (1 − obsW) × prior_attack
defense_posterior = obsW × mean(xG_conceded) + (1 − obsW) × prior_defense
```

### Shots-Based xG Formula

When ESPN match data is available, xG is computed from live box score statistics rather than a goals proxy:

```
xG = SoT × 0.30 + offTarget × 0.04 + corners × 0.04 + (possession − 0.5) × 0.5
```

| Stat | Weight | Rationale |
|---|---|---|
| Shots on target | 0.30 | Primary scoring threat |
| Off-target shots | 0.04 | Volume / pressure signal |
| Corners | 0.04 | Set-piece opportunity |
| Possession bonus | 0.50 | Territorial dominance above 50% |

When box score data is unavailable (knockout placeholder games), a goals proxy is used: `xG = goals × 0.85 + 0.15`.

### Red Card Suspensions

Players who receive a red card are automatically suspended for the next game. The λ value for the affected team is penalised per suspension:

```
λ *= 0.94 ^ suspensions
```

A team missing two suspended players has their expected goals reduced by ~11%.

### Market Calibration

When bookmaker lines are available, the Poisson λ values are calibrated to the market:

- **O/U total line** → scales the λ sum to match expected total goals
- **Spread/handicap** → shifts the λ split to match expected goal difference

### Elo Ratings

Elo ratings are initialised from FIFA rankings (K=32) and updated live after each WC 2026 result. Home team receives +30 Elo advantage. The Elo win probability feeds the 5% blend component.

### Live Model Injection

After each completed match, ESPN box score data is fetched and used to re-estimate all team strength parameters:

- Shots, possession, corners, saves are pulled from the ESPN scoreboard
- `injectLiveResults()` rebuilds the full Bayesian model with the new data
- The model updates automatically — predictions for upcoming games improve as more results come in
- Results from WC 2026 are weighted 4× higher than WC 2022 data

### API Quota Conservation

To avoid exhausting the bookmaker odds API:
- **Odds TTL**: 12 hours — cached odds are reused between refreshes
- **Auto-refresh** (every 60 s): uses `skipOdds=true` — does not consume quota
- **Manual Refresh** button: fetches fresh odds and consumes one API request

---

## 🎛️ Features

- **All Games / Next 2 Days / Finished / Teams / Algorithm** tabs
- **Algorithm tab** — interactive score probability heatmap, live match statistics panel with per-team averages (shots, possession, corners, saves), team strength charts, Elo rankings, full model equations
- **Algorithm Breakdown** on every game card — shows Poisson λ, market odds, Elo ratings, xG strength, FIFA ranking, WC form, weather, xG source, suspension warnings
- **Goal scorers with minute** displayed under team flags on finished game cards
- **Mobile sidebar** — slide-in drawer via hamburger button on small screens
- **Decimal + American odds** side by side
- **Implied win probability** bar for every match
- **API quota tracker** shows requests used/remaining
- **Auto-refresh** every 60 seconds (odds-API-quota-safe)

---

## 📁 File Structure

```
wc2026-predictions/
├── server.js          # Express backend, ESPN fetching, caching, prediction endpoints
├── predictor.js       # Dixon-Coles model, Bayesian estimation, Elo, WC results data
├── public/
│   └── index.html     # Full frontend (single file, no build needed)
├── package.json
└── README.md
```

---

## 🔑 API Notes

- Sport key: `soccer_fifa_world_cup`
- Markets: `h2h`, spread, over/under via ESPN pickcenter
- Regions: `eu, uk, us`
- Odds format: `decimal`
- ESPN scoreboard used for live scores, box scores, goal scorers, and red cards

---

## 📚 References

- Dixon, M. & Coles, S. (1997). *Modelling Association Football Scores and Inefficiencies in the Football Betting Market*. Journal of the Royal Statistical Society.
- Elo, A. (1978). *The Rating of Chess Players, Past and Present*. Arco Publishing.
