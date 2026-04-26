# GF.sh — Skills4People / The AI Scientist
## TECHNICAL VIDEO SCRIPT  |  2 minutes  |  Audience: hackathon judges / technical reviewers

---

### [0:00 – 0:12]  FRAMING  *(voice-over)*

> "The brief asked us to compress weeks of lab-planning into a complete, operationally realistic experiment plan. We met that bar. Then we built a platform around it — one that compounds in value every time a scientist uses it."

---

### [0:12 – 0:38]  THE PIPELINE  *(screen: architecture flow)*

> "Three stages.
>
> **Literature QC**: Six parallel searches — Semantic Scholar, PubMed, arXiv, OpenAlex, protocol repositories, Tavily. Sources are domain-filtered: arXiv only fires for materials and physics hypotheses; PubMed for biological ones. References are de-duplicated and re-ranked by Jaccard token overlap against the hypothesis. Output: novelty signal with confidence — 'not found', 'similar work exists', or 'exact match'.
>
> **Evidence grounding**: Concurrent Tavily searches against supplier databases — Sigma-Aldrich, Thermo Fisher, ATCC. Regex extracts catalog numbers, prices, pack sizes, concentrations from raw page content. This grounds materials in purchasable items — not hallucinated SKUs.
>
> **Plan generation**: Structured output via OpenAI GPT-4o, Google Gemini, and Claude — protocol, materials with catalog numbers, line-item budget with contingency, phased timeline with decision gates, full validation design including statistical analysis plan, safety section, risk register, explicit assumptions. Every AI call has a heuristic fallback — the system degrades gracefully."

---

### [0:38 – 1:00]  PLAN CRITIQUE  *(screen: critique panel)*

> "After every plan, a second AI pass scans the output for six weakness categories: missing control conditions, insufficient sample size, weak statistical design, validation gaps, safety oversights, feasibility issues.
>
> This is the system auditing itself. Rated as weak, needs attention, or solid — with specific, actionable findings. A scientist sees exactly where to push back before ordering anything.
>
> This was not in the brief. We added it because a plan that doesn't know its own weaknesses isn't trustworthy."

---

### [1:00 – 1:25]  THREE-BUCKET FEEDBACK PLATFORM  *(screen: feedback buckets / applied rules)*

> "The stretch goal asked for a feedback loop. We built a scoped feedback platform.
>
> Every scientist correction is AI-classified into one of three buckets: Organisation — applies across all plans; Category — applies to a specific experiment type like Cell Biology; Experiment — applies only when continuing from a specific saved plan.
>
> Under the hood: corrections are embedded with Gemini's 768-dimensional model, stored in Supabase with a pgvector HNSW index, and retrieved via a custom `match_experiments()` RPC using cosine similarity. At plan-generation time, applicable rules from all three buckets are injected as labelled prompt blocks — *ORGANISATION POLICIES*, *CATEGORY RULES*, *EXPERIMENT-SPECIFIC RULES* — so the scientist can see exactly what shaped the output.
>
> The system ships with approximately 1,600 real feedback entries pre-seeded from prior testing. It is useful on first boot."

---

### [1:25 – 1:45]  DOCUMENT UPLOAD  *(screen: document manager)*

> "Also not in the brief: document upload. Scientists can upload their own PDFs, plain text, or markdown — lab SOPs, safety guidelines, preferred supplier lists — at the organisation level or tied to a specific experiment.
>
> Documents are extracted via pdf-parse, capped at 60 kilobytes per document, and threaded into the plan generation prompt under a dedicated *UPLOADED REFERENCE DOCUMENTS* block. Organisation-scoped documents inject into every plan. Experiment-scoped documents inject only when continuing from that experiment.
>
> Your standard operating procedures become part of every plan your team generates."

---

### [1:45 – 1:55]  STACK  *(screen: tech logos / architecture)*

> "Stack: Next.js 14, TypeScript, OpenAI GPT-4o, Google Gemini, Claude, Supabase pgvector, Tavily, Vercel AI SDK with streamObject for structured streaming. Persistent stores: plan library, feedback library, category system, document store — all with atomic write-lock patterns. Deployed on Vercel."

---

### [1:55 – 2:00]  CLOSE

> "We didn't build a tool. We built a platform that gets better every time a scientist uses it — every plan saved, every correction made, every document uploaded.
>
> **GF.sh. Skills4People.**"

---

*[End card: github.com/fescofesco/Skill4People  ·  Hack-Nation 5th Global AI Hackathon  ·  HUB-LINZ]*
