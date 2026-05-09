import dotenv from "dotenv";
import express from "express";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const port = process.env.PORT || 3000;
const pipeshiftApiBase = process.env.PIPESHIFT_API_BASE || "https://api.pipeshift.com/api/v0";
const pipeshiftModel = process.env.PIPESHIFT_MODEL || "moonshotai/Kimi-K2.6";
const rocketRatesUrl = "https://www.rocketmortgage.com/mortgage-rates";
const defaultRates = [
  { name: "30-year fixed", rate: 6.875, apr: 7.25, termYears: 30, source: "Fallback estimate" },
  { name: "20-year fixed", rate: 6.625, apr: 7.02, termYears: 20, source: "Fallback estimate" },
  { name: "15-year fixed", rate: 6.125, apr: 6.55, termYears: 15, source: "Fallback estimate" },
  { name: "30-year FHA", rate: 6.25, apr: 7.05, termYears: 30, source: "Fallback estimate" },
  { name: "30-year VA", rate: 6.25, apr: 6.68, termYears: 30, source: "Fallback estimate" },
];

app.use(express.json({ limit: "1mb" }));

const money = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const percent = (value) => `${Number(value || 0).toFixed(3).replace(/\.?0+$/, "")}%`;

function monthlyPrincipalAndInterest(loanAmount, annualRate, termYears) {
  const months = termYears * 12;
  const monthlyRate = annualRate / 100 / 12;

  if (!loanAmount || loanAmount <= 0) return 0;
  if (!monthlyRate) return loanAmount / months;

  return (loanAmount * monthlyRate * (1 + monthlyRate) ** months) / ((1 + monthlyRate) ** months - 1);
}

function parseNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRocketRates(html) {
  const cards = html.split("<sc-rate-card").slice(1);
  const rates = [];

  for (const card of cards) {
    const cardHtml = `<sc-rate-card${card}`;
    const title =
      cardHtml.match(/data-analytics-name="([^"]*(?:fixed|FHA|VA|jumbo|Jumbo)[^"]*)"/i)?.[1] ||
      cardHtml.match(/text="([^"]*(?:fixed|FHA|VA|jumbo|Jumbo)[^"]*)"/i)?.[1] ||
      stripHtml(cardHtml).match(/((?:30|20|15)-year\s+(?:fixed|FHA|VA|jumbo))/i)?.[1];
    const rate = parseNumber(cardHtml.match(/data-ssr-rate[^>]*>\s*([$0-9.,%]+)/i)?.[1], NaN);
    const apr = parseNumber(cardHtml.match(/data-ssr-apr[^>]*>\s*([$0-9.,%]+)/i)?.[1], NaN);
    const points = parseNumber(cardHtml.match(/data-ssr-finalpoints[^>]*>\s*([$0-9.,%]+)/i)?.[1], NaN);
    const payment = parseNumber(cardHtml.match(/Monthly payment[\s\S]{0,420}?data-ssr-rate[^>]*>\s*([$0-9.,%]+)/i)?.[1], NaN);

    if (title && Number.isFinite(rate)) {
      const normalizedTitle = title.replace(/\s+/g, " ").trim();
      if (!rates.some((item) => item.name.toLowerCase() === normalizedTitle.toLowerCase())) {
        rates.push({
          name: normalizedTitle,
          rate,
          apr: Number.isFinite(apr) ? apr : null,
          points: Number.isFinite(points) ? points : null,
          samplePayment: Number.isFinite(payment) ? payment : null,
          termYears: normalizedTitle.includes("15") ? 15 : normalizedTitle.includes("20") ? 20 : 30,
          source: "Rocket Mortgage",
        });
      }
    }
  }

  return rates.slice(0, 8);
}

async function getRocketRates() {
  const response = await fetch(rocketRatesUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Rocket Mortgage returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const rates = extractRocketRates(html);

  if (!rates.length) {
    throw new Error("No Rocket Mortgage rates could be parsed.");
  }

  return {
    rates,
    source: "Rocket Mortgage",
    sourceUrl: rocketRatesUrl,
    fetchedAt: new Date().toISOString(),
  };
}

function calculateMortgage(input) {
  const price = parseNumber(input.price, 650000);
  const downPayment = parseNumber(input.downPayment, 130000);
  const rate = parseNumber(input.rate, 6.875);
  const termYears = parseNumber(input.termYears, 30);
  const annualTaxRate = parseNumber(input.taxRate, 1.15);
  const annualInsurance = parseNumber(input.insurance, 1800);
  const hoa = parseNumber(input.hoa, 0);
  const income = parseNumber(input.annualIncome, 160000);
  const monthlyDebts = parseNumber(input.monthlyDebts, 600);
  const monthlyBudget = parseNumber(input.monthlyBudget, 4200);

  const loanAmount = Math.max(price - downPayment, 0);
  const downPaymentPct = price ? downPayment / price : 0;
  const principalInterest = monthlyPrincipalAndInterest(loanAmount, rate, termYears);
  const taxes = (price * (annualTaxRate / 100)) / 12;
  const insurance = annualInsurance / 12;
  const pmi = downPaymentPct < 0.2 ? (loanAmount * 0.0065) / 12 : 0;
  const totalPayment = principalInterest + taxes + insurance + hoa + pmi;
  const monthlyIncome = income / 12;
  const frontEndDti = monthlyIncome ? totalPayment / monthlyIncome : 0;
  const backEndDti = monthlyIncome ? (totalPayment + monthlyDebts) / monthlyIncome : 0;
  const maxTotalPayment = Math.max(Math.min(monthlyBudget || Infinity, monthlyIncome * 0.43 - monthlyDebts), 0);

  let affordablePrice = downPayment;
  for (let testPrice = 100000; testPrice <= 3000000; testPrice += 5000) {
    const testLoan = Math.max(testPrice - downPayment, 0);
    const testPi = monthlyPrincipalAndInterest(testLoan, rate, termYears);
    const testTaxes = (testPrice * (annualTaxRate / 100)) / 12;
    const testInsurance = annualInsurance / 12;
    const testPmi = downPayment / testPrice < 0.2 ? (testLoan * 0.0065) / 12 : 0;
    if (testPi + testTaxes + testInsurance + hoa + testPmi <= maxTotalPayment) {
      affordablePrice = testPrice;
    } else if (testPrice > affordablePrice + 20000) {
      break;
    }
  }

  return {
    price,
    loanAmount,
    downPayment,
    downPaymentPct,
    rate,
    termYears,
    principalInterest,
    taxes,
    insurance,
    hoa,
    pmi,
    totalPayment,
    frontEndDti,
    backEndDti,
    maxTotalPayment,
    affordablePrice,
  };
}

function recommendPrograms(input, calculation) {
  const creditScore = parseNumber(input.creditScore, 720);
  const downPaymentPct = calculation.downPaymentPct * 100;
  const propertyUse = input.propertyUse || "primary";
  const documentation = input.documentation || "full-doc";
  const veteran = Boolean(input.veteran);
  const rentCoverage = parseNumber(input.rentCoverage, 0);
  const exitMonths = parseNumber(input.exitMonths, 12);
  const backEndDtiPct = calculation.backEndDti * 100;
  const results = [];

  const add = (program, score, reason, watchout) => results.push({ program, score, reason, watchout });

  add(
    "Conventional",
    (creditScore >= 700 ? 30 : 16) + (downPaymentPct >= 5 ? 22 : 8) + (backEndDtiPct <= 45 ? 22 : 8),
    "Best fit when credit, documented income, and DTI are strong for an owner-occupied purchase.",
    "PMI usually applies below 20% down.",
  );

  add(
    "QM",
    (documentation === "full-doc" ? 28 : 8) + (backEndDtiPct <= 43 ? 26 : 10) + (creditScore >= 660 ? 18 : 8),
    "Best fit for a standard ability-to-repay purchase file with documented income and conservative DTI.",
    "If income is complex or DTI is stretched, another program may fit better.",
  );

  add(
    "FHA",
    (creditScore >= 580 ? 26 : 4) + (downPaymentPct >= 3.5 ? 24 : 6) + (propertyUse === "primary" ? 24 : 0),
    "Useful for a primary-residence purchase with lower down payment or more forgiving credit profile.",
    "Mortgage insurance is typically required and investment purchases are not the target use.",
  );

  add(
    "VA",
    (veteran ? 50 : 0) + (propertyUse === "primary" ? 24 : 0) + (creditScore >= 620 ? 14 : 6),
    "Potentially excellent for eligible veterans, service members, and qualifying spouses buying a primary residence.",
    "Eligibility and VA entitlement must be confirmed.",
  );

  add(
    "Non-QM",
    (documentation !== "full-doc" ? 34 : 10) + (creditScore >= 660 ? 18 : 8) + (downPaymentPct >= 15 ? 22 : 8),
    "Often fits self-employed, bank-statement, DSCR-adjacent, or higher-DTI purchase scenarios.",
    "Rates and down payment requirements are usually higher than agency loans.",
  );

  add(
    "DSCR",
    (propertyUse === "investment" ? 36 : 0) + (rentCoverage >= 1 ? 26 : 8) + (downPaymentPct >= 20 ? 24 : 8),
    "Designed for investment-property purchases where rental income supports the debt.",
    "Not a primary-residence program; lender DSCR thresholds vary.",
  );

  add(
    "Hard Money",
    (propertyUse === "fix-flip" ? 42 : 6) + (exitMonths <= 18 ? 20 : 6) + (downPaymentPct >= 20 ? 18 : 6),
    "Most relevant for short-term bridge, fix-and-flip, or time-sensitive investor purchases.",
    "Usually carries higher cost and a clear exit strategy is critical.",
  );

  return results
    .map((item) => ({ ...item, score: Math.max(Math.min(Math.round(item.score), 100), 0) }))
    .sort((a, b) => b.score - a.score);
}

async function askPipeshift(question) {
  const apiKey = process.env.PIPESHIFT_API_KEY;

  if (!apiKey) {
    throw new Error("PIPESHIFT_API_KEY is not configured.");
  }

  const response = await fetch(`${pipeshiftApiBase.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: pipeshiftModel,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are a purchase-money mortgage assistant. Answer only about home purchase financing, monthly payment planning, affordability, rates, and program fit. Do not make final credit decisions. Do not use protected-class information. Explain assumptions and encourage review by a licensed mortgage professional.",
        },
        { role: "user", content: question },
      ],
    }),
  });

  const rawBody = await response.text();
  let body;

  try {
    body = JSON.parse(rawBody);
  } catch {
    body = { error: rawBody };
  }

  if (!response.ok) {
    const message = body?.error?.message || body?.message || body?.error || "Pipeshift request failed.";
    throw new Error(message);
  }

  return body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || body?.output_text || "No answer returned.";
}

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Purchase Mortgage Planner</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f5f1e8;
        color: #16201d;
        --ink: #16201d;
        --muted: #5d6861;
        --line: #d7d0c3;
        --paper: #fffdf8;
        --green: #173d35;
        --clay: #b7653d;
        --gold: #e6b85c;
        --sage: #dfe8dc;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(135deg, rgba(23, 61, 53, 0.14), transparent 42%),
          linear-gradient(315deg, rgba(183, 101, 61, 0.16), transparent 38%),
          var(--paper);
      }

      button, input, select, textarea { font: inherit; }

      .shell {
        width: min(1220px, 100%);
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 24px;
        align-items: end;
        padding: 18px 0 30px;
      }

      .eyebrow {
        margin: 0 0 10px;
        color: var(--clay);
        font-size: 0.78rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        max-width: 830px;
        margin: 0;
        font-size: clamp(2.35rem, 7vw, 5.2rem);
        line-height: 0.94;
        letter-spacing: 0;
      }

      .subhead {
        max-width: 720px;
        margin: 18px 0 0;
        color: var(--muted);
        font-size: 1.06rem;
        line-height: 1.65;
      }

      .rate-source {
        min-width: 260px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 16px;
        background: rgba(255, 253, 248, 0.82);
        box-shadow: 0 18px 50px rgba(21, 36, 30, 0.07);
      }

      .rate-source strong { display: block; margin-bottom: 6px; }
      .rate-source span { color: var(--muted); font-size: 0.92rem; line-height: 1.45; }

      .grid {
        display: grid;
        grid-template-columns: minmax(330px, 0.95fr) minmax(0, 1.35fr);
        gap: 20px;
        align-items: start;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: 8px;
        background: rgba(255, 253, 248, 0.9);
        box-shadow: 0 16px 46px rgba(21, 36, 30, 0.075);
        overflow: hidden;
      }

      .panel-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: center;
        border-bottom: 1px solid var(--line);
        padding: 16px 18px;
      }

      .panel-head h2, .panel-head h3 {
        margin: 0;
        font-size: 1rem;
      }

      .panel-body { padding: 18px; }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      label {
        display: grid;
        gap: 7px;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 800;
      }

      input, select, textarea {
        width: 100%;
        border: 1px solid #beb7aa;
        border-radius: 8px;
        padding: 11px 12px;
        background: #fffefa;
        color: var(--ink);
      }

      textarea {
        min-height: 128px;
        resize: vertical;
        line-height: 1.55;
      }

      input:focus, select:focus, textarea:focus, button:focus-visible {
        outline: 3px solid rgba(23, 61, 53, 0.22);
        outline-offset: 2px;
      }

      .wide { grid-column: 1 / -1; }

      .actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 16px;
      }

      button {
        border: 0;
        border-radius: 8px;
        padding: 11px 15px;
        color: #fff;
        background: var(--green);
        font-weight: 900;
        cursor: pointer;
      }

      button.secondary {
        color: var(--green);
        background: var(--sage);
      }

      button:disabled { opacity: 0.7; cursor: wait; }

      .stack {
        display: grid;
        gap: 20px;
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .metric {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        background: #fffefa;
      }

      .metric span {
        display: block;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .metric strong {
        display: block;
        margin-top: 8px;
        font-size: clamp(1.35rem, 3vw, 2rem);
        letter-spacing: 0;
      }

      .split {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .breakdown, .programs, .rates {
        display: grid;
        gap: 10px;
      }

      .row, .program, .rate-card {
        display: grid;
        gap: 6px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
        background: #fffefa;
      }

      .row {
        grid-template-columns: 1fr auto;
        align-items: center;
      }

      .row span, .program p, .rate-card span, .disclaimer {
        color: var(--muted);
      }

      .program-top, .rate-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .score {
        min-width: 58px;
        border-radius: 999px;
        padding: 5px 9px;
        background: #173d35;
        color: #fff;
        font-size: 0.84rem;
        font-weight: 900;
        text-align: center;
      }

      .rate-value {
        font-size: 1.35rem;
        font-weight: 950;
      }

      .chat {
        display: grid;
        gap: 14px;
      }

      #answer {
        min-height: 190px;
        margin: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        background: #fffefa;
        color: #26332e;
        white-space: pre-wrap;
        line-height: 1.65;
      }

      .error { color: #9b2d1f; }

      .disclaimer {
        margin: 14px 0 0;
        font-size: 0.82rem;
        line-height: 1.5;
      }

      @media (max-width: 980px) {
        header, .grid, .split { grid-template-columns: 1fr; }
        .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media (max-width: 620px) {
        .form-grid, .metrics { grid-template-columns: 1fr; }
        .shell { padding-inline: 14px; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div>
          <p class="eyebrow">Purchase money only</p>
          <h1>Mortgage fit, payment, and affordability planner</h1>
          <p class="subhead">Estimate a home purchase payment, see buying power, pull daily purchase-rate data from Rocket Mortgage when available, and compare loan programs without drifting into refinance or general underwriting.</p>
        </div>
        <aside class="rate-source">
          <strong id="rate-source-title">Loading rates</strong>
          <span id="rate-source-copy">Trying Rocket Mortgage purchase rates...</span>
        </aside>
      </header>

      <section class="grid">
        <form class="panel" id="scenario-form">
          <div class="panel-head">
            <h2>Purchase Scenario</h2>
            <span class="score">Live</span>
          </div>
          <div class="panel-body">
            <div class="form-grid">
              <label>Purchase price <input name="price" type="number" value="650000" min="0" step="1000" /></label>
              <label>Down payment <input name="downPayment" type="number" value="130000" min="0" step="1000" /></label>
              <label>Annual income <input name="annualIncome" type="number" value="160000" min="0" step="1000" /></label>
              <label>Monthly debts <input name="monthlyDebts" type="number" value="600" min="0" step="50" /></label>
              <label>Monthly budget <input name="monthlyBudget" type="number" value="4200" min="0" step="50" /></label>
              <label>Credit score <input name="creditScore" type="number" value="720" min="300" max="850" step="1" /></label>
              <label>Rate <input name="rate" id="rate-input" type="number" value="6.875" min="0" step="0.001" /></label>
              <label>Term <select name="termYears"><option value="30">30 years</option><option value="20">20 years</option><option value="15">15 years</option></select></label>
              <label>Property tax % <input name="taxRate" type="number" value="1.15" min="0" step="0.01" /></label>
              <label>Annual insurance <input name="insurance" type="number" value="1800" min="0" step="50" /></label>
              <label>Monthly HOA <input name="hoa" type="number" value="0" min="0" step="25" /></label>
              <label>Property use <select name="propertyUse"><option value="primary">Primary residence</option><option value="investment">Investment rental</option><option value="fix-flip">Fix-and-flip</option></select></label>
              <label>Income documentation <select name="documentation"><option value="full-doc">Full doc / W-2 or tax returns</option><option value="bank-statement">Bank statements / self-employed</option><option value="asset-based">Asset-based or alternative</option></select></label>
              <label>Veteran eligible <select name="veteran"><option value="">No / not sure</option><option value="true">Yes</option></select></label>
              <label>DSCR / rent coverage <input name="rentCoverage" type="number" value="1.05" min="0" step="0.01" /></label>
              <label>Exit timeline months <input name="exitMonths" type="number" value="12" min="1" step="1" /></label>
            </div>
            <div class="actions">
              <button type="submit">Calculate</button>
              <button class="secondary" type="button" id="refresh-rates">Refresh Rates</button>
            </div>
            <p class="disclaimer">Estimates are for purchase-money planning only and are not lending, legal, tax, or financial advice.</p>
          </div>
        </form>

        <section class="stack">
          <section class="panel">
            <div class="panel-head">
              <h2>Payment And Buying Power</h2>
              <span id="selected-rate-label">6.875%</span>
            </div>
            <div class="panel-body">
              <div class="metrics">
                <div class="metric"><span>Total payment</span><strong id="total-payment">$0</strong></div>
                <div class="metric"><span>Affordable price</span><strong id="affordable-price">$0</strong></div>
                <div class="metric"><span>Loan amount</span><strong id="loan-amount">$0</strong></div>
                <div class="metric"><span>Back-end DTI</span><strong id="backend-dti">0%</strong></div>
              </div>
              <div class="split" style="margin-top:14px;">
                <div class="breakdown" id="payment-breakdown"></div>
                <div class="programs" id="programs"></div>
              </div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h3>Daily Purchase Rates</h3>
              <span>Rocket Mortgage</span>
            </div>
            <div class="panel-body">
              <div class="rates" id="rates"></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h3>Ask The Purchase Mortgage Assistant</h3>
              <span>${pipeshiftModel}</span>
            </div>
            <div class="panel-body chat">
              <textarea id="question" placeholder="Ask about the best purchase loan path for this scenario, cash-to-close tradeoffs, PMI, DSCR, FHA versus conventional, or hard money exit risk."></textarea>
              <div class="actions">
                <button type="button" id="ask-button">Ask</button>
                <button class="secondary" type="button" id="draft-question">Use Current Scenario</button>
              </div>
              <pre id="answer">Ask a purchase-money mortgage question.</pre>
            </div>
          </section>
        </section>
      </section>
    </main>

    <script>
      const form = document.querySelector("#scenario-form");
      const ratesEl = document.querySelector("#rates");
      const programsEl = document.querySelector("#programs");
      const breakdownEl = document.querySelector("#payment-breakdown");
      const rateInput = document.querySelector("#rate-input");
      const answer = document.querySelector("#answer");
      const question = document.querySelector("#question");
      let latestScenario = null;
      let latestRates = [];

      const usd = (value) => Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
      const pct = (value) => (Number(value || 0) * 100).toFixed(1) + "%";

      function formPayload() {
        const data = Object.fromEntries(new FormData(form).entries());
        data.veteran = data.veteran === "true";
        return data;
      }

      function renderResult(data) {
        latestScenario = data;
        document.querySelector("#total-payment").textContent = usd(data.calculation.totalPayment);
        document.querySelector("#affordable-price").textContent = usd(data.calculation.affordablePrice);
        document.querySelector("#loan-amount").textContent = usd(data.calculation.loanAmount);
        document.querySelector("#backend-dti").textContent = pct(data.calculation.backEndDti);
        document.querySelector("#selected-rate-label").textContent = data.calculation.rate + "%";

        breakdownEl.innerHTML = [
          ["Principal & interest", data.calculation.principalInterest],
          ["Property taxes", data.calculation.taxes],
          ["Insurance", data.calculation.insurance],
          ["HOA", data.calculation.hoa],
          ["Estimated PMI", data.calculation.pmi],
        ].map(([label, value]) => '<div class="row"><span>' + label + '</span><strong>' + usd(value) + '</strong></div>').join("");

        programsEl.innerHTML = data.programs.slice(0, 5).map((item) => '<article class="program"><div class="program-top"><strong>' + item.program + '</strong><span class="score">' + item.score + '</span></div><p>' + item.reason + '</p><p><strong>Watch:</strong> ' + item.watchout + '</p></article>').join("");
      }

      async function calculate() {
        const response = await fetch("/api/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formPayload()),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not calculate scenario.");
        renderResult(data);
      }

      function renderRates(payload) {
        latestRates = payload.rates || [];
        document.querySelector("#rate-source-title").textContent = payload.source === "Rocket Mortgage" ? "Rocket rates loaded" : "Using fallback rates";
        document.querySelector("#rate-source-copy").textContent = payload.source === "Rocket Mortgage"
          ? "Fetched " + new Date(payload.fetchedAt).toLocaleString() + " from Rocket Mortgage purchase rates."
          : "Rocket blocked or changed the page, so the app is using editable fallback rates.";

        ratesEl.innerHTML = latestRates.map((rate, index) => '<button class="rate-card" type="button" data-index="' + index + '"><div class="rate-top"><strong>' + rate.name + '</strong><span class="rate-value">' + rate.rate + '%</span></div><span>APR ' + (rate.apr ?? "n/a") + '% · Term ' + rate.termYears + ' years · ' + rate.source + '</span></button>').join("");
      }

      async function loadRates() {
        ratesEl.innerHTML = '<div class="row"><span>Loading Rocket purchase rates...</span><strong></strong></div>';
        const response = await fetch("/api/rates");
        const payload = await response.json();
        renderRates(payload);
      }

      ratesEl.addEventListener("click", async (event) => {
        const card = event.target.closest(".rate-card");
        if (!card) return;
        const selected = latestRates[Number(card.dataset.index)];
        if (!selected) return;
        rateInput.value = selected.rate;
        form.elements.termYears.value = selected.termYears;
        await calculate();
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await calculate();
      });

      document.querySelector("#refresh-rates").addEventListener("click", loadRates);

      document.querySelector("#draft-question").addEventListener("click", () => {
        const payload = formPayload();
        question.value = "For a purchase-money mortgage scenario with purchase price $" + payload.price + ", down payment $" + payload.downPayment + ", credit score " + payload.creditScore + ", annual income $" + payload.annualIncome + ", monthly debts $" + payload.monthlyDebts + ", property use " + payload.propertyUse + ", and rate " + payload.rate + "%, which loan program looks most suitable and what should the borrower watch out for?";
        question.focus();
      });

      document.querySelector("#ask-button").addEventListener("click", async () => {
        const prompt = question.value.trim();
        if (!prompt) {
          answer.textContent = "Enter a purchase mortgage question first.";
          answer.classList.add("error");
          return;
        }

        answer.classList.remove("error");
        answer.textContent = "Thinking through purchase options...";

        try {
          const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: prompt, scenario: latestScenario }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "The model request failed.");
          answer.textContent = data.answer;
        } catch (error) {
          answer.classList.add("error");
          answer.textContent = error.message;
        }
      });

      loadRates().then(calculate).catch((error) => {
        document.querySelector("#rate-source-title").textContent = "Calculator ready";
        document.querySelector("#rate-source-copy").textContent = error.message;
        calculate();
      });
    </script>
  </body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/rates", async (_req, res) => {
  try {
    const payload = await getRocketRates();
    return res.json(payload);
  } catch (error) {
    return res.json({
      rates: defaultRates,
      source: "Fallback estimates",
      sourceUrl: rocketRatesUrl,
      fetchedAt: new Date().toISOString(),
      warning: error.message,
    });
  }
});

app.post("/api/calculate", (req, res) => {
  const calculation = calculateMortgage(req.body ?? {});
  const programs = recommendPrograms(req.body ?? {}, calculation);
  res.json({ calculation, programs });
});

app.post("/api/ask", async (req, res) => {
  const question = String(req.body?.question || "").trim();

  if (!question) {
    return res.status(400).json({ error: "Question is required." });
  }

  try {
    const answer = await askPipeshift(question);
    return res.json({ answer, model: pipeshiftModel });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Unable to get a response." });
  }
});

app.listen(port, () => {
  console.log(`Purchase mortgage planner listening on port ${port}`);
});
