# GF.sh — Skills4People / The AI Scientist
## TECHNICAL VIDEO SCRIPT  |  2 minutes  |  Target: judges / technical audience

---

### [0:00 – 0:15]  THE PROBLEM STATEMENT  *(voice-over)*

> "The brief asked us to compress weeks of lab-planning into an automated experiment plan. The quality bar: a plan a real scientist could pick up on Monday and start running by Friday — protocol steps, reagents with catalog numbers, realistic budgets, phased timelines, and validation design.
>
> We met that bar. Then we went further."

---

### [0:15 – 0:40]  WHAT WE BUILT — THE PIPELINE  *(screen: architecture / flow diagram)*

> "The system has three stages.
>
> **Stage one: Literature QC.** We run six parallel searches — Semantic Scholar, PubMed, arXiv, OpenAlex, protocols.io, and Tavily web search. Sources are filtered by domain: arXiv only activates for physics and materials hypotheses; PubMed for biological and clinical ones. References are de-duplicated, re-ranked by Jaccard token overlap against the hypothesis, and classified as 'not found', 'similar work exists', or 'exact match' — with a confidence score.
>
> **Stage two: Evidence gathering.** Concurrently, Tavily runs targeted searches against supplier databases — Sigma-Aldrich, Thermo Fisher, ATCC — extracting catalog numbers, prices, pack sizes, and concentrations via regex. This grounds the materials list in real purchasable items, not hallucinated SKUs.
>
> **Stage three: Plan generation.** GPT-4o, Gemini, and Claude generate the structured plan — protocol, materials, budget with contingency, phased timeline, full validation design including statistical analysis plan, safety section, risk register, and explicit assumptions. Every AI call has a heuristic fallback — the system degrades gracefully with no API key."

---

### [0:40 – 1:05]  WHAT WE DID BEYOND THE REQUIREMENTS  *(screen: critique panel)*

> "Three things we built that weren't in the brief.
>
> **First: the plan critique.** After every plan is generated, a second AI pass scans the output for six categories of weakness — missing control conditions, insufficient sample size, weak statistical design, validation gaps, safety oversights, and feasibility issues. It rates them: weak, needs attention, or solid.
>
> This is the system checking its own work. Not just generating and shipping — but flagging where a scientist should push back before they order anything.
>
> **Second: user-specific risk profiling.** Every hypothesis is screened for hard-blocks — gain-of-function research, pathogen synthesis, unapproved human trials. These return a review-only plan with full reasoning. Soft flags — animal work, GMOs, controlled substances — propagate into the plan's safety section with required approvals and expert-review gates.
>
> **Third: a composite confidence score.** Every plan gets a score across four dimensions: evidence quality, supplier completeness, validation completeness, and feedback relevance. Scientists can see at a glance how much to trust the output before committing to purchases."

---

### [1:05 – 1:40]  THE RAG FEEDBACK LOOP  *(screen: Supabase schema / feedback flow)*

> "This is the stretch goal — and we implemented it properly.
>
> When a scientist corrects a section of a generated plan — say, they flag that our sample size was too small for their specific cell line — that correction is processed by Gemini's embedding model into a 768-dimensional semantic vector. That vector, along with the structured correction, is stored in Supabase with a pgvector extension and an HNSW index.
>
> The next time any user submits a hypothesis, we run a cosine similarity search via a custom Supabase RPC — match_experiments() — retrieving the top four prior experiments with similarity above 0.5. Their corrections are aggregated and injected as few-shot context directly into the system prompt for the new plan.
>
> The result: the plan generation visibly improves for similar experiment types. The judge can watch a correction get made, submit a similar hypothesis, and see the correction reflected — automatically, without re-prompting.
>
> This is the difference between a tool and a platform that compounds in value."

---

### [1:40 – 1:55]  ARCHITECTURE SUMMARY  *(screen: tech stack)*

> "Tech stack: Next.js 14, TypeScript, OpenAI GPT-4o, Google Gemini, Claude, Supabase pgvector, Tavily, Vercel AI SDK with streamObject for structured streaming. Deployed on Vercel.
>
> Every AI call has a heuristic fallback. Every search has a timed wrapper that never throws. The system is production-deployable today."

---

### [1:55 – 2:00]  CLOSE

> "We didn't just build what was asked. We built something a real scientist would actually use — and that gets better every time they do.
>
> **GF.sh. Skills4People.**"

---

*[End card: github.com/fescofesco/Skill4People — Hack-Nation 5th Global AI Hackathon · HUB-LINZ]*
