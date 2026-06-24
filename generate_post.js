const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, ExternalHyperlink, PageNumber, Header, Footer
} = require('docx');
const fs = require('fs');

const border = { style: BorderStyle.SINGLE, size: 1, color: "2d3e5a" };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: "1a2d4a" })]
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: "2563eb" })]
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, font: "Arial", size: 24, bold: true, color: "374151" })]
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 22, ...opts })]
  });
}

function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 22, bold })]
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0", space: 1 } },
    children: []
  });
}

function factorRow(name, weight, desc, color) {
  return new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 2000, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        shading: { fill: color, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: name, font: "Arial", size: 20, bold: true })] })]
      }),
      new TableCell({
        borders,
        width: { size: 800, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        shading: { fill: color, type: ShadingType.CLEAR },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: weight, font: "Arial", size: 20, bold: true, color: "1d4ed8" })] })]
      }),
      new TableCell({
        borders,
        width: { size: 6560, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        shading: { fill: color, type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: desc, font: "Arial", size: 20 })] })]
      })
    ]
  });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1a2d4a" },
        paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "2563eb" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "374151" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "WC 2026 AI Prediction Engine  |  Page ", font: "Arial", size: 18, color: "9ca3af" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "9ca3af" })
          ]
        })]
      })
    },
    children: [

      // ── TITLE ──────────────────────────────────────────────────────────────
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({ text: "Building a Real-Time AI Prediction Engine for the 2026 World Cup", font: "Arial", size: 48, bold: true, color: "0a0e1a" })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: "How I combined live bookmaker odds, xG data, FIFA rankings, weather, and bookmaker spread lines into a 10-factor prediction model — and built a live dashboard to display it.", font: "Arial", size: 24, color: "4b5563", italics: true })]
      }),
      divider(),

      // ── INTRO ──────────────────────────────────────────────────────────────
      h2("The Idea"),
      p("The 2026 World Cup is the biggest sporting event on the planet, with 48 teams playing across the US, Canada, and Mexico. I wanted to build something more sophisticated than a simple odds tracker — a system that actually thinks about WHY one team should beat another."),
      p("The result is a Node.js web app that pulls live data from multiple sources every 90 seconds, runs each upcoming match through a 10-factor weighted algorithm, and presents predictions in a clean real-time dashboard."),

      divider(),

      // ── WHAT IT DOES ───────────────────────────────────────────────────────
      h2("What the App Does"),
      p("At its core the app answers one question for every upcoming game: who is most likely to win, and what will the score be? To do that it:"),
      bullet("Fetches live odds from 49 bookmakers via The Odds API"),
      bullet("Pulls scores, standings, and match data from the ESPN API (no key required)"),
      bullet("Fetches the DraftKings spread line and over/under for each game from ESPN’s pickcenter"),
      bullet("Derives group standings and automatically detects tournament context (must win / can draw)"),
      bullet("Runs every upcoming game through a 10-factor prediction algorithm"),
      bullet("Displays everything on a live dashboard that auto-refreshes every 60 seconds"),
      new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }),
      p("The sidebar shows AI-predicted scores for all games in the next 48 hours. Clicking any sidebar entry scrolls directly to its full card in the main view."),

      divider(),

      // ── THE STACK ──────────────────────────────────────────────────────────
      h2("The Tech Stack"),
      p("The entire backend is a single Node.js/Express server (~320 lines). The frontend is a single vanilla HTML/JS file with no frameworks. Keeping it simple meant I could iterate on the algorithm very fast."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2400, 6960],
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "1e3a5f", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "Layer", font: "Arial", size: 20, bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "1e3a5f", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "Choice", font: "Arial", size: 20, bold: true, color: "FFFFFF" })] })] })
            ]
          }),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Backend", font: "Arial", size: 20, bold: true })] })] }),
            new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Node.js + Express", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "f8fafc", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Frontend", font: "Arial", size: 20, bold: true })] })] }),
            new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "f8fafc", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Vanilla HTML/CSS/JS — no frameworks", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Odds data", font: "Arial", size: 20, bold: true })] })] }),
            new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "The Odds API (49 bookmakers, EU/UK/US regions)", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "f8fafc", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "Match / scores", font: "Arial", size: 20, bold: true })] })] }),
            new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "f8fafc", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "ESPN public API (free, no key)", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "Spread / O∕U", font: "Arial", size: 20, bold: true })] })] }),
            new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: "ESPN summary endpoint — DraftKings pickcenter data", font: "Arial", size: 20 })] })] })
          ]}),
        ]
      }),

      divider(),

      // ── THE ALGORITHM ───────────────────────────────────────────────────────
      h2("The Prediction Algorithm"),
      p("The algorithm combines 10 independent signals, each weighted by how much empirical predictive power it has for football. The weights were informed by academic research on football prediction models and adjusted based on what actually matters at a major tournament."),

      new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [2000, 800, 6560],
        rows: [
          new TableRow({
            children: [
              new TableCell({ borders, width: { size: 2000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "1e3a5f", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "Factor", font: "Arial", size: 20, bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders, width: { size: 800, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "1e3a5f", type: ShadingType.CLEAR },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Weight", font: "Arial", size: 20, bold: true, color: "FFFFFF" })] })] }),
              new TableCell({ borders, width: { size: 6560, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, shading: { fill: "1e3a5f", type: ShadingType.CLEAR },
                children: [new Paragraph({ children: [new TextRun({ text: "Why it matters", font: "Arial", size: 20, bold: true, color: "FFFFFF" })] })] })
            ]
          }),
          factorRow("Odds consensus", "38%", "Average implied probability across 49 bookmakers. The single most predictive signal — bookmakers price millions of bets.", "f0f9ff"),
          factorRow("Asian handicap", "4–18%", "The spread line (e.g. −2.5) encodes the expected margin. Weight jumps to 18% in “deep mode” for close matchups.", "f0f9ff"),
          factorRow("Tournament xG", "17%", "Expected goals from actual WC 2026 matches. More reliable than scorelines, which can be misleading.", "ffffff"),
          factorRow("FIFA ranking", "14%", "Normalized rank difference between the two teams. Lower rank = stronger team.", "f0f9ff"),
          factorRow("WC form / pts", "11%", "Points earned in the tournament so far. Measures momentum and consistency.", "ffffff"),
          factorRow("Squad depth", "8%", "A 1–10 score based on the number of top-5 European league players in the squad.", "f0f9ff"),
          factorRow("Weather impact", "3%", "Hot/humid conditions benefit warm-climate teams; cool temps benefit northern European sides.", "ffffff"),
          factorRow("Social buzz", "2%", "Google Trends / Twitter activity proxy. High buzz = slight momentum boost.", "f0f9ff"),
          factorRow("H2H history", "2%", "All-time World Cup head-to-head record between the two teams.", "ffffff"),
          factorRow("Tournament pressure", "1%", "Auto-detected context: must win / can draw based on live group standings.", "f0f9ff"),
        ]
      }),

      new Paragraph({ spacing: { before: 160, after: 0 }, children: [] }),

      h3("Score Prediction"),
      p("When bookmaker spread and over/under lines are available, the predicted score is derived directly from them:"),
      new Paragraph({
        spacing: { before: 80, after: 80 },
        indent: { left: 720 },
        children: [new TextRun({ text: "Favored team xG  = (Over∕Under + |Spread|) ÷ 2", font: "Courier New", size: 22, bold: true, color: "1d4ed8" })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 160 },
        indent: { left: 720 },
        children: [new TextRun({ text: "Underdog xG      = (Over∕Under − |Spread|) ÷ 2", font: "Courier New", size: 22, bold: true, color: "1d4ed8" })]
      }),
      p("Example: England vs Ghana has spread −2.5 and O/U 2.5. So England xG = (2.5 + 2.5)/2 = 2.5 → predicted 3–0. This reflects what bookmakers actually expect, not a fixed tournament average."),

      h3("Deep Mode"),
      p("When the odds spread between home and away is less than 15% (a very close matchup), the algorithm enters “Deep Mode”: the Asian handicap weight jumps from 4% to 18%, and the odds consensus drops slightly. The handicap line is a more precise signal for close games because it prices just the outcome margin, without the draw probability diluting the signal."),

      h3("Draw Probability"),
      p("Draw probability is preserved directly from the bookmaker 3-way odds (home/draw/away). The win probabilities for home and away are then scaled proportionally to fill the remaining (1 − drawProb) probability space. This was a critical fix — an earlier version produced draw probabilities as low as 5%, whereas the bookmaker-calibrated figure sits around 25–30% for most games."),

      divider(),

      // ── DATA SOURCES ───────────────────────────────────────────────────────
      h2("Data Sources"),

      h3("The Odds API"),
      p("The backbone of the system. A single API call fetches h2h (1X2) prices from all 49 available bookmakers across EU, UK, and US markets. Prices are averaged across bookmakers to reduce house edge, then converted to implied probabilities via a standard devig (remove-vig) calculation."),

      h3("ESPN Public API"),
      p("ESPN’s undocumented-but-public API is remarkably rich. The scoreboard endpoint returns live scores, and the summary endpoint — called per match — returns:"),
      bullet("Spread line and over/under from DraftKings pickcenter"),
      bullet("Money line odds for both teams"),
      bullet("Live group standings (rank, points, goal difference, games played)"),
      bullet("Last 5 game results per team"),
      p("The standings are used to automatically detect tournament context: a team ranked 3rd with 0 points on matchday 3 is flagged as “must win,” and a team ranked 1st with 6 points is flagged “can draw.” These flow into the pressure factor."),

      h3("Static Data"),
      p("Some data is baked in as static tables:"),
      bullet("WC 2026 matchday 1 & 2 results with xG values"),
      bullet("FIFA World Rankings (June 2026)"),
      bullet("Head-to-head records for key rivalry matchups"),
      bullet("Venue weather data (temperature, humidity, condition) for all 16 host cities"),
      bullet("Squad depth scores (1–10) based on top-5 league player counts"),
      bullet("Social buzz index (0–100) as a proxy for team momentum"),

      divider(),

      // ── WHAT I LEARNED ─────────────────────────────────────────────────────
      h2("Key Engineering Decisions"),

      h3("Parallel fetching everywhere"),
      p("The ESPN scraper fires 29 date-range requests simultaneously with Promise.all(), fetching a ±14-day window in one parallel burst. Prediction enrichment also runs all upcoming games in parallel — a 28-game matchday goes from ~14 seconds sequential to under 2 seconds."),

      h3("Multi-layer caching"),
      p("Odds are cached for 90 seconds, ESPN scores for 2 minutes, predictions for 10 minutes, and ESPN summaries (spread/standings) for 10 minutes. This keeps the app responsive under load while staying within API rate limits."),

      h3("Score prediction was too conservative"),
      p("The first version predicted scores from tournament xG alone and produced results like England 1–0 Ghana. With spread −2.5 and O/U 2.5, the bookmakers clearly expected a much bigger margin. Switching to the (O∕U + |spread|) ÷ 2 formula immediately produced England 3–0, which is a much better calibrated prediction."),

      h3("Draw probability normalization"),
      p("An early bug: the normalization formula used an arbitrary 0.4 multiplier on draw probability in the denominator, which squished draws to 5–6%. The fix was to preserve draw probability from the bookmaker odds and split the remaining probability proportionally between the win outcomes."),

      divider(),

      // ── CONCLUSION ─────────────────────────────────────────────────────────
      h2("What’s Next"),
      p("The model has room to grow. Some ideas on the roadmap:"),
      bullet("Injury and suspension data — key absences are a huge signal that’s currently not captured"),
      bullet("Pre-tournament club form — how well players were performing for their clubs leading into the WC"),
      bullet("Knockout stage logic — different pressure dynamics once elimination is immediate"),
      bullet("Accuracy tracking — comparing predicted vs. actual results to measure and improve the algorithm"),
      bullet("Historical calibration — back-testing the weights against WC 2018 and 2022 data"),

      new Paragraph({ spacing: { before: 200, after: 80 }, children: [] }),
      divider(),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 0 },
        children: [new TextRun({ text: "Built with Node.js, The Odds API, and the ESPN public API. WC 2026.", font: "Arial", size: 18, color: "9ca3af", italics: true })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('/Users/shahar/Downloads/wc2026_prediction_post.docx', buffer);
  console.log('Done: /Users/shahar/Downloads/wc2026_prediction_post.docx');
});
