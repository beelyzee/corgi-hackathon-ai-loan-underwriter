import dotenv from "dotenv";
import express from "express";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const port = process.env.PORT || 3000;
const pipeshiftApiBase = process.env.PIPESHIFT_API_BASE || "https://api.pipeshift.com/api/v0";
const pipeshiftModel = process.env.PIPESHIFT_MODEL || "moonshotai/Kimi-K2.6";

app.use(express.json({ limit: "1mb" }));

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
            "You are an AI assistant for a hackathon loan-underwriting prototype. Help users reason about loan files, missing documentation, risk factors, and policy questions. Do not make final approval or denial decisions. Do not use or infer protected-class information. Keep answers practical, explain assumptions, and recommend human review for consequential decisions.",
        },
        {
          role: "user",
          content: question,
        },
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

  return (
    body?.choices?.[0]?.message?.content ||
    body?.choices?.[0]?.text ||
    body?.output_text ||
    "The model returned an empty response."
  );
}

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
        background: #f6f4ef;
        color: #16201d;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(135deg, rgba(33, 90, 76, 0.14), transparent 42%),
          linear-gradient(315deg, rgba(216, 113, 73, 0.16), transparent 38%),
          #f6f4ef;
      }

      main {
        width: min(1120px, 100%);
        margin: 0 auto;
        padding: 48px 24px;
      }

      header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 36px;
      }

      .eyebrow {
        margin: 0 0 10px;
        color: #ba5d35;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        max-width: 760px;
        margin: 0;
        font-size: clamp(2.4rem, 7vw, 5.5rem);
        line-height: 0.94;
        letter-spacing: 0;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: fit-content;
        border: 1px solid #c9d5ce;
        border-radius: 8px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.74);
        font-weight: 800;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #248655;
      }

      .workspace {
        display: grid;
        grid-template-columns: minmax(0, 0.86fr) minmax(320px, 1.14fr);
        gap: 22px;
        align-items: stretch;
      }

      .prompt-panel,
      .answer-panel {
        border: 1px solid #cfd6d0;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
        box-shadow: 0 18px 50px rgba(21, 36, 30, 0.08);
      }

      .prompt-panel {
        padding: 20px;
      }

      label {
        display: block;
        margin-bottom: 12px;
        font-size: 0.95rem;
        font-weight: 800;
      }

      textarea {
        width: 100%;
        min-height: 210px;
        resize: vertical;
        border: 1px solid #b9c5be;
        border-radius: 8px;
        padding: 14px;
        color: inherit;
        background: #fffdf9;
        font: inherit;
        line-height: 1.5;
      }

      textarea:focus,
      button:focus-visible {
        outline: 3px solid rgba(22, 100, 84, 0.25);
        outline-offset: 2px;
      }

      .actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-top: 14px;
      }

      button {
        border: 0;
        border-radius: 8px;
        padding: 12px 18px;
        background: #173d35;
        color: #ffffff;
        font: inherit;
        font-weight: 900;
        cursor: pointer;
      }

      button:disabled {
        cursor: wait;
        opacity: 0.7;
      }

      .hint {
        margin: 0;
        color: #5b6861;
        font-size: 0.92rem;
        line-height: 1.5;
      }

      .answer-panel {
        min-height: 360px;
        overflow: hidden;
      }

      .answer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        border-bottom: 1px solid #d9dfda;
        padding: 16px 18px;
      }

      .answer-header h2 {
        margin: 0;
        font-size: 1rem;
      }

      .model {
        color: #5b6861;
        font-size: 0.84rem;
        overflow-wrap: anywhere;
      }

      #answer {
        min-height: 294px;
        margin: 0;
        padding: 20px;
        white-space: pre-wrap;
        color: #24302c;
        font: inherit;
        line-height: 1.65;
      }

      .error {
        color: #9b2d1f;
      }

      @media (max-width: 820px) {
        header {
          align-items: flex-start;
          flex-direction: column;
        }

        .workspace {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <p class="eyebrow">Corgi Hackathon</p>
          <h1>AI Loan Underwriter</h1>
        </div>
        <div class="status"><span class="dot"></span>Render ready</div>
      </header>

      <section class="workspace" aria-label="Loan underwriting assistant">
        <form class="prompt-panel" id="ask-form">
          <label for="question">Ask an underwriting question</label>
          <textarea id="question" name="question" placeholder="Example: Borrower has $125k income, $2,100 monthly debt, and requests a $510k loan. What risks or missing details should we check?"></textarea>
          <div class="actions">
            <p class="hint">The API key stays on the server.</p>
            <button type="submit" id="submit-button">Ask</button>
          </div>
        </form>

        <section class="answer-panel" aria-live="polite">
          <div class="answer-header">
            <h2>Response</h2>
            <span class="model">${pipeshiftModel}</span>
          </div>
          <pre id="answer">Ask a question to get an underwriting-focused response.</pre>
        </section>
      </section>
    </main>

    <script>
      const form = document.querySelector("#ask-form");
      const textarea = document.querySelector("#question");
      const answer = document.querySelector("#answer");
      const button = document.querySelector("#submit-button");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const question = textarea.value.trim();
        if (!question) {
          answer.textContent = "Enter a question first.";
          answer.classList.add("error");
          textarea.focus();
          return;
        }

        button.disabled = true;
        button.textContent = "Asking...";
        answer.classList.remove("error");
        answer.textContent = "Thinking through the loan file...";

        try {
          const response = await fetch("/api/ask", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "The model request failed.");
          }

          answer.textContent = data.answer;
        } catch (error) {
          answer.classList.add("error");
          answer.textContent = error.message;
        } finally {
          button.disabled = false;
          button.textContent = "Ask";
        }
      });
    </script>
  </body>
</html>`);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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
