# Corgi Hackathon - AI Loan Underwriter

Hackathon project for building an AI-assisted loan underwriting workflow.

## Project Goal

Create a prototype that helps review loan applications by:

- Collecting borrower, income, asset, debt, and property information
- Identifying missing or inconsistent application details
- Summarizing underwriting risk factors
- Producing explainable recommendations for human review

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

- `GET /` - basic project landing page
- `GET /health` - Render health check
- `POST /api/underwrite` - starter underwriting review endpoint

Common next steps:

- Choose the frontend/backend stack
- Define the loan application data model
- Add sample anonymized application data
- Build the underwriting prompt or rules engine
- Add tests for important risk calculations

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
