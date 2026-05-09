import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Corgi Hackathon - AI Loan Underwriter</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8faf7;
        color: #17231f;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }

      main {
        width: min(860px, 100%);
      }

      h1 {
        margin: 0 0 16px;
        font-size: clamp(2.5rem, 6vw, 5rem);
        line-height: 0.95;
        letter-spacing: 0;
      }

      p {
        max-width: 680px;
        margin: 0 0 24px;
        font-size: 1.1rem;
        line-height: 1.7;
        color: #44524d;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #cfd9d4;
        border-radius: 8px;
        padding: 10px 14px;
        background: #ffffff;
        font-weight: 700;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #1f9d55;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>AI Loan Underwriter</h1>
      <p>
        A Render-ready hackathon starter for building an AI-assisted workflow that reviews loan
        applications, flags missing information, and summarizes underwriting risks for human review.
      </p>
      <div class="status"><span class="dot"></span>Service is running</div>
    </main>
  </body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/underwrite", (req, res) => {
  const application = req.body ?? {};
  const missingFields = ["borrowerName", "annualIncome", "monthlyDebt", "loanAmount"].filter(
    (field) => application[field] === undefined || application[field] === null || application[field] === "",
  );

  res.json({
    status: missingFields.length === 0 ? "ready_for_review" : "needs_more_information",
    missingFields,
    summary:
      missingFields.length === 0
        ? "Application has the minimum fields needed for a preliminary underwriting review."
        : "Application is missing required fields before a preliminary review can be completed.",
  });
});

app.listen(port, () => {
  console.log(`AI loan underwriter service listening on port ${port}`);
});
