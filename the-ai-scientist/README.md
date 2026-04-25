# The AI Scientist

From scientific hypothesis to operational experiment plan.

This is a hackathon prototype for turning a scientific hypothesis into a structured, reviewable experiment-planning dossier with literature QC, supplier/material transparency, budget estimation, timeline, validation design, safety/compliance review, and a visible scientist-feedback loop.

The app is intentionally conservative: generated plans are for expert review, not direct execution. Operational details must be checked against approved local SOPs and institutional approvals.

## Challenge Mapping

- **Input:** natural-language scientific hypothesis with four quick-fill examples.
- **Literature QC:** `/api/literature` parses the hypothesis, searches available literature sources, and returns a novelty signal.
- **Experiment Plan:** `/api/generate-plan` retrieves relevant feedback, gathers protocol/supplier evidence when configured, and returns a validated structured plan.
- **Scientist Review Loop:** users can correct plan items; feedback is saved to `data/feedback_store.json`; later similar plans retrieve and visibly apply prior corrections.
- **Export:** generated plans can be downloaded as JSON or Markdown for review outside the app.
- **Plan Confidence:** dashboard and Markdown exports show a composite confidence score based on evidence quality, supplier completeness, validation completeness, and feedback relevance.

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Zod validation
- OpenAI Node SDK (optional)
- Semantic Scholar / PubMed / OpenAlex / arXiv searches where available
- Tavily supplier/protocol search (optional)
- Local JSON feedback store

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## Environment Variables

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
TAVILY_API_KEY=
SEMANTIC_SCHOLAR_API_KEY=
ENABLE_DEMO_FALLBACK=true
```

Missing API keys do not crash the app. With `ENABLE_DEMO_FALLBACK=true`, the app clearly labels low-confidence fallback behavior.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
npm run smoke
npm run feedback:seed
npm run feedback:reset
```

## Demo Script

1. Start the app with `npm run dev`.
2. Open http://localhost:3000.
3. Confirm status badges show API configuration and feedback store.
4. Click **Diagnostics**.
5. Click **Run Literature QC**.
6. Show novelty signal and references or coverage warnings.
7. Click **Generate Experiment Plan**.
8. Show protocol, materials, budget, timeline, validation, safety, risks, assumptions, and evidence quality.
9. Click **Edit / Correct** on a validation or protocol item.
10. Enter: “Include whole-blood matrix spike recovery controls before claiming ELISA-equivalent sensitivity.”
11. Reason: “Buffer-only calibration does not prove whole-blood performance.”
12. Save feedback.
13. Click **Regenerate with Feedback**.
14. Show the Applied Scientist Feedback panel and changed plan text.

## API Routes

- `GET /api/health`
- `POST /api/literature`
- `POST /api/generate-plan`
- `GET /api/feedback`
- `POST /api/feedback`
- `POST /api/feedback/retrieve`
- `POST /api/feedback/seed` (development only)
- `POST /api/feedback/reset` (development only)

All route inputs and outputs are validated with Zod where relevant. API keys are read only on the server.

## Feedback Learning Loop

Feedback is saved as structured scientist corrections. The system derives a reusable rule, stores it locally, scores relevance by domain, experiment type, tags, keyword overlap, applicability, severity, and optional embeddings, then injects matching rules into later plan generation. The UI shows exactly which feedback rules were applied.

In development, the sidebar includes **Seed demo feedback** and **Reset feedback** buttons so judges can quickly exercise the learning loop.

## Safety and Compliance

The prototype flags human samples, animal work, cell lines, live microbes, environmental release, biohazards, chemicals, sharps, and electrical/cryogenic hazards. Plans require expert review before execution.

To keep the local demo reliable and compatible with model-provider safety policies, deterministic fallback plans are review-oriented and avoid becoming executable wet-lab SOPs. They still include the required planning sections, validation design, controls, materials, budget, timeline, risks, assumptions, and feedback loop.

## Known Limitations

- Local JSON feedback store is not production-safe under high concurrency.
- Vercel/serverless filesystem persistence may be ephemeral.
- Literature QC is a fast signal, not a systematic review.
- Supplier pricing may be incomplete or vary by region/account.
- No authentication in this prototype.
- Feedback loop is lightweight RAG/rule injection, not fine-tuning.
- Generated plans require expert scientist review before execution.
