# Corgi Hackathon - Purchase Mortgage Planner

Hackathon project for building an AI-assisted purchase-money mortgage planning workflow.

## Project Goal

Create a prototype that helps home buyers and loan teams compare purchase mortgage options by:

- Calculating estimated monthly payment
- Estimating purchase price affordability
- Pulling purchase-rate data from Rocket Mortgage when available
- Recommending likely-fit loan programs for human review
- Answering purchase-money mortgage questions with a server-side AI assistant

## Collaboration

Suggested workflow:

1. Create a branch for each feature or experiment.
2. Open pull requests into `main`.
3. Keep secrets in `.env.local` and share required variable names through `.env.example`.
4. Document major product or architecture decisions in this README as the project evolves.

## Getting Started

This repo uses a small Node.js/Express service so it can deploy cleanly to Render.

Install dependencies and run locally:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

Useful endpoints:

- `GET /` - purchase mortgage planner UI
- `GET /health` - Render health check
- `GET /api/rates` - attempts to fetch Rocket Mortgage purchase rates, with fallback estimates
- `POST /api/calculate` - calculates payment, affordability, and loan program fit
- `POST /api/ask` - asks the Pipeshift-backed purchase mortgage assistant a question

Common next steps:

- Add state-specific taxes and insurance defaults
- Add product overlays by lender
- Add cash-to-close and seller-credit calculations
- Add amortization and payment comparison views
- Add tests for important payment and affordability calculations

## Deploying on Render

This repo includes `render.yaml` for Render Blueprint deploys.

1. In Render, create a new Blueprint.
2. Connect this GitHub repo.
3. Render will use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Add any secrets, such as AI API keys, in Render's environment variable settings.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in local values.

Required for model answers:

- `PIPESHIFT_API_KEY` - Pipeshift API key, configured in Render or `.env.local`
- `PIPESHIFT_MODEL` - model name to call, defaults to `moonshotai/Kimi-K2.6`
- `PIPESHIFT_API_BASE` - Pipeshift API base URL, defaults to `https://api.pipeshift.com/api/v0`
- `SESSION_SECRET` - random secret used to sign login sessions
- `BASE_URL` - full app URL used by OAuth callback (example: `https://your-app.onrender.com`)
- `GOOGLE_CLIENT_ID` - Google OAuth web app client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth web app client secret

## Google Auth Setup

1. In Google Cloud Console, create OAuth credentials for a Web application.
2. Add authorized redirect URI:
   - `https://your-render-domain/auth/google/callback`
   - For local development: `http://localhost:3000/auth/google/callback`
3. In Render environment variables, set `SESSION_SECRET`, `BASE_URL`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.
4. Redeploy and use the "Sign in with Google" button in the app.
