# ⚽ WC 2026 AI Prediction Engine

Real-time World Cup 2026 prediction dashboard powered by a Dixon-Coles Poisson model with Bayesian team strength estimation, live bookmaker odds blending, and Bayesian Elo ratings. Auto-refreshes every 60 seconds with a clean dark UI and an interactive algorithm explorer.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
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

### 4. Open the app
```
http://localhost:3000
```

---

## 🧠 The Prediction Algorithm

The engine uses a three-component probabilistic model that produces a full **10×10 score probability matrix** rather than a single win/loss prediction.

### Component Blend

| Component | Weight | Description |
|---|---|---|
| **Dixon-Coles Poisson** | 55% | Full score matrix with Bayesian team strength estimation |
| **Market Odds** | 40% | Consensus from 49 bookmakers (de-vigged) |
| **Bayesian Elo** | 5% | Live Elo ratings updated after each WC result |

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
- **Training data**: WC 2026 results (weight 1.0×) + WC 2022 results (weight 0.25×) — 104 matches total
- Exponential decay applied by recency position within each tournament

```
attack_posterior  = obsW × mean(xG_scored)  + (1 − obsW) × prior_attack
defense_posterior = obsW × mean(xG_conceded) + (1 − obsW) × prior_defense
```

### Market Calibration

When bookmaker lines are available, the Poisson λ values are calibrated to the market:

- **O/U total line** → scales the λ sum to match expected total goals
- **Spread/handicap** → shifts the λ split to match expected goal difference

### Elo Ratings

Elo ratings are initialised from FIFA rankings (K=32) and updated live after each WC 2026 result. Home team receives +30 Elo advantage. The Elo win probability feeds the 5% blend component.

### Final Probability Blend

```
# With market odds (most games):
P_home = 0.55 × Poisson_home + 0.40 × Market_home + 0.05 × Elo_home

# Without market odds (hypothetical matchups):
P_home = 0.82 × Poisson_home + 0.18 × Elo_home
```

---

## 🎛️ Features

- **All Games / Next 2 Days / Finished / Teams / Algorithm** tabs
- **Algorithm tab** — interactive score probability heatmap, team strength charts, Elo rankings, full model equations
- **Algorithm Breakdown** on every game card — shows Poisson λ values, market odds, Elo ratings, xG strength, FIFA ranking, WC form, weather
- **Decimal + American odds** side by side
- **Implied win probability** bar for every match
- **49-bookmaker consensus** — aggregates and de-vigs odds across EU/UK/US books
- **API quota tracker** shows requests used/remaining
- **Auto-refresh** every 60 seconds

---

## 📁 File Structure

```
wc2026-predictions/
├── server.js          # Express backend, odds fetching, caching, /api/lambda endpoint
├── predictor.js       # Dixon-Coles model, Bayesian estimation, Elo, WC results data
├── public/
│   └── index.html     # Full frontend (single file, no build needed)
├── .env.example       # Required environment variables
├── package.json
└── README.md
```

---

## 🔑 API Notes

- Sport key: `soccer_fifa_world_cup`
- Markets: `h2h`, spread, over/under via ESPN pickcenter
- Regions: `eu, uk, us`
- Odds format: `decimal`

---

## 📚 References

- Dixon, M. & Coles, S. (1997). *Modelling Association Football Scores and Inefficiencies in the Football Betting Market*. Journal of the Royal Statistical Society.
- Elo, A. (1978). *The Rating of Chess Players, Past and Present*. Arco Publishing.
