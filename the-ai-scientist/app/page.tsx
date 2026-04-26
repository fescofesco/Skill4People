"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Beaker,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FlaskConical,
  Newspaper,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sparkles
} from "lucide-react";
import type {
  ExperimentPlan,
  HealthResponse,
  LiteratureQC,
  ParsedHypothesis,
  Reference,
  ScientistFeedback
} from "@/lib/schemas";

const samples = [
  {
    label: "Diagnostics",
    text: "A paper-based electrochemical biosensor functionalized with anti-CRP antibodies will detect C-reactive protein in whole blood at concentrations below 0.5 mg/L within 10 minutes, matching laboratory ELISA sensitivity without requiring sample preprocessing."
  },
  {
    label: "Gut Health",
    text: "Supplementing C57BL/6 mice with Lactobacillus rhamnosus GG for 4 weeks will reduce intestinal permeability by at least 30% compared to controls, measured by FITC-dextran assay, due to upregulation of tight junction proteins claudin-1 and occludin."
  },
  {
    label: "Cell Biology",
    text: "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol, due to trehalose's superior membrane stabilization at low temperatures."
  },
  {
    label: "Climate",
    text: "Introducing Sporomusa ovata into a bioelectrochemical system at a cathode potential of -400 mV vs SHE will fix CO2 into acetate at a rate of at least 150 mmol/L/day, outperforming current biocatalytic carbon capture benchmarks by at least 20%."
  }
];

type Stage = "input" | "literature_loading" | "literature_ready" | "plan_loading" | "plan_ready" | "error";

type FeedbackTarget = {
  item_type: ScientistFeedback["item_type"];
  item_id: string;
  original_context: string;
  label: string;
};

type SearchSourceStat = {
  name: string;
  status: "ok" | "empty" | "error";
  count: number;
  durationMs: number;
  error: string | null;
};

type LiteratureDiagnostics = {
  sources: string[];
  sourceStats?: SearchSourceStat[];
  demoFallback: boolean;
  openaiConfigured: boolean;
  parseSource: "openai" | "heuristic";
  parseModel: string | null;
  parseErrors: string[];
  noveltySource: "openai" | "heuristic" | "demo";
  noveltyModel: string | null;
  noveltyErrors: string[];
  referenceCount: number;
};

type PlanGenerationMeta = {
  source: "openai" | "deterministic_fallback" | "safety_restricted";
  model: string | null;
  attempts: number;
  errors: string[];
};

type EvidenceSourceStat = {
  name: string;
  status: "ok" | "empty" | "error" | "skipped";
  count: number;
  durationMs: number;
  error: string | null;
};

type EvidenceMeta = {
  tavilyConfigured: boolean;
  sourceStats: EvidenceSourceStat[];
  regulatoryReasons: string[];
  cardCount: number;
};

type CritiqueFinding = {
  area:
    | "controls"
    | "statistics"
    | "sample_size"
    | "validation"
    | "safety"
    | "feasibility"
    | "evidence"
    | "scope";
  finding: string;
  suggestion: string;
  severity: "info" | "warning" | "critical";
};

type PlanCritiqueMeta = {
  source: "openai" | "heuristic";
  model: string | null;
  overall_assessment: "weak" | "needs_work" | "solid";
  findings: CritiqueFinding[];
  errors: string[];
};

type LiteratureQCWithMeta = LiteratureQC & { _diagnostics?: LiteratureDiagnostics };
type ExperimentPlanWithMeta = ExperimentPlan & {
  _generation?: PlanGenerationMeta;
  _evidence?: EvidenceMeta;
  _critique?: PlanCritiqueMeta;
};

export default function Home() {
  const [hypothesis, setHypothesis] = useState(samples[0].text);
  const [stage, setStage] = useState<Stage>("input");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [literatureQC, setLiteratureQC] = useState<LiteratureQC | null>(null);
  const [litDiag, setLitDiag] = useState<LiteratureDiagnostics | null>(null);
  const [plan, setPlan] = useState<ExperimentPlan | null>(null);
  const [genMeta, setGenMeta] = useState<PlanGenerationMeta | null>(null);
  const [evidenceMeta, setEvidenceMeta] = useState<EvidenceMeta | null>(null);
  const [critique, setCritique] = useState<PlanCritiqueMeta | null>(null);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [recentFeedback, setRecentFeedback] = useState<ScientistFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedSincePlan, setSavedSincePlan] = useState(false);

  useEffect(() => {
    void refreshHealthAndFeedback();
  }, []);

  // Auto-dismiss toasts after 5s so the success/info banner doesn't linger.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const validation = useMemo(() => validateHypothesis(hypothesis), [hypothesis]);

  function resetDownstream() {
    setLiteratureQC(null);
    setLitDiag(null);
    setPlan(null);
    setGenMeta(null);
    setEvidenceMeta(null);
    setCritique(null);
    setSavedSincePlan(false);
  }

  async function refreshHealthAndFeedback() {
    const [healthRes, fbRes] = await Promise.allSettled([
      fetch("/api/health", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/feedback", { cache: "no-store" }).then((r) => r.json())
    ]);
    if (healthRes.status === "fulfilled") setHealth(healthRes.value);
    if (fbRes.status === "fulfilled") {
      setFeedbackCount(fbRes.value.count || 0);
      setRecentFeedback((fbRes.value.feedback || []).slice(-4).reverse());
    }
  }

  async function runLiteratureQC() {
    if (!validation.ok) {
      setError(validation.message || "Invalid hypothesis.");
      return;
    }
    setError(null);
    setStage("literature_loading");
    resetDownstream();
    try {
      const res = await fetch("/api/literature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hypothesis })
      });
      const json = (await res.json()) as LiteratureQCWithMeta & {
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json?.error?.message || "Literature QC failed");
      const { _diagnostics, ...qcOnly } = json;
      setLiteratureQC(qcOnly as LiteratureQC);
      setLitDiag(_diagnostics ?? null);
      setStage("literature_ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Literature QC failed");
      setStage("error");
    }
  }

  async function generatePlan() {
    if (!literatureQC) return;
    setError(null);
    setStage("plan_loading");
    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hypothesis, literature_qc: literatureQC })
      });
      const json = (await res.json()) as ExperimentPlanWithMeta & {
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json?.error?.message || "Plan generation failed");
      const { _generation, _evidence, _critique, ...planOnly } = json;
      setPlan(planOnly as ExperimentPlan);
      setGenMeta(_generation ?? null);
      setEvidenceMeta(_evidence ?? null);
      setCritique(_critique ?? null);
      setStage("plan_ready");
      setSavedSincePlan(false);
      void refreshHealthAndFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan generation failed");
      setStage("error");
    }
  }

  async function saveFeedback(payload: {
    correction: string;
    reason: string;
    rating_before: number | null;
    tags: string[];
    applicability: ScientistFeedback["applicability"];
    severity: ScientistFeedback["severity"];
    confidence: number;
  }) {
    if (!target || !plan) return;
    const body = {
      source_plan_id: plan.plan_id,
      hypothesis,
      parsed_hypothesis: plan.hypothesis.parsed,
      domain: plan.hypothesis.parsed.domain,
      experiment_type: plan.hypothesis.parsed.experiment_type,
      item_type: target.item_type,
      item_id: target.item_id,
      original_context: target.original_context,
      ...payload
    };
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || "Feedback save failed");
    setToast("Scientist feedback saved and will be retrieved for similar plans.");
    setTarget(null);
    setSavedSincePlan(true);
    void refreshHealthAndFeedback();
  }

  async function runFeedbackAction(action: "seed" | "reset") {
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${action}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || `Feedback ${action} failed`);
      setToast(action === "seed" ? "Seeded demo feedback examples." : "Feedback store reset.");
      await refreshHealthAndFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Feedback ${action} failed`);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-slate-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-blue-600" /> Hackathon prototype
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
              The AI Scientist
            </h1>
            <p className="mt-2 text-base text-slate-600 md:text-lg">
              From scientific hypothesis to operational experiment plan
            </p>
          </div>
          <StatusBadges health={health} feedbackCount={feedbackCount} />
        </header>
        <StageProgress stage={stage} />


        {toast && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {health && health.env.openaiConfigured === false && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:flex-row md:items-center md:justify-between">
            <div>
              <b>OpenAI key not detected.</b> The app will use a deterministic template fallback
              instead of calling a real model. Add{" "}
              <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> to{" "}
              <code className="rounded bg-amber-100 px-1">.env.local</code> (or set it in Vercel)
              and reload.
            </div>
          </div>
        )}

        {(() => {
          if (!health?.env.openaiConfigured) return null;
          const allErrors = [
            ...(litDiag?.parseErrors ?? []),
            ...(litDiag?.noveltyErrors ?? []),
            ...(genMeta?.errors ?? [])
          ];
          if (allErrors.length === 0) return null;
          const quota = allErrors.some((e) => /\b429\b|quota|billing|exceeded/i.test(e));
          const policy = allErrors.some((e) => /policy|blocked|safety/i.test(e));
          const fallbackActive =
            litDiag?.parseSource === "heuristic" ||
            litDiag?.noveltySource === "heuristic" ||
            litDiag?.noveltySource === "demo" ||
            genMeta?.source === "deterministic_fallback";
          if (!fallbackActive) return null;
          return (
            <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              <div className="font-semibold">
                AI calls failed — showing deterministic fallback output
                {quota ? " (OpenAI quota exceeded)" : policy ? " (provider policy block)" : ""}.
              </div>
              <div className="mt-1 text-rose-800">
                The OpenAI API key is configured, but every recent request fell back to the
                heuristic / template path. Fix:&nbsp;
                {quota ? (
                  <>
                    top up credits at{" "}
                    <a
                      className="underline"
                      href="https://platform.openai.com/account/billing"
                      target="_blank"
                      rel="noopener"
                    >
                      platform.openai.com/account/billing
                    </a>{" "}
                    — no redeploy needed.
                  </>
                ) : policy ? (
                  <>rephrase the hypothesis or check provider safety policy.</>
                ) : (
                  <>see expandable error details on the literature card / plan dashboard below.</>
                )}
              </div>
            </div>
          );
        })()}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Stage A — Input</h2>
                  <p className="text-sm text-slate-600">
                    Enter any scientific hypothesis, question, or research topic. The AI will parse
                    it; if it&apos;s too vague to plan, the parsed hypothesis and novelty rationale
                    will say so.
                  </p>
                </div>
                <Badge tone="blue">{hypothesis.length}/3000</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {samples.map((sample) => (
                  <button
                    key={sample.label}
                    className="rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => {
                      setHypothesis(sample.text);
                      resetDownstream();
                      setError(null);
                      setStage("input");
                    }}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="hypothesis">
                Hypothesis
              </label>
              <textarea
                id="hypothesis"
                className="mt-2 min-h-40 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-900 shadow-inner focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
              />
              {!validation.ok && (
                <p className="mt-2 text-sm text-red-700">{validation.message}</p>
              )}
              <button
                onClick={runLiteratureQC}
                disabled={!validation.ok || stage === "literature_loading" || stage === "plan_loading"}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Search className="h-4 w-4" />
                {stage === "literature_loading" ? "Running Literature QC..." : "Run Literature QC"}
              </button>
            </Card>

            {stage === "literature_loading" && (
              <LoadingCard
                label="Searching literature and parsing hypothesis..."
                steps={[
                  "Parsing intervention, system, and outcome with the AI parser",
                  "Querying Semantic Scholar, OpenAlex, PubMed, arXiv in parallel",
                  "Pulling recent preprints and breakthrough coverage via Tavily news",
                  "Surfacing protocol references from protocols.io and JoVE",
                  "Classifying novelty signal and de-duplicating references"
                ]}
              />
            )}
            {literatureQC && (
              <LiteratureCard
                qc={literatureQC}
                diagnostics={litDiag}
                onGenerate={generatePlan}
                onUpdateParsed={(parsed) => {
                  // Editing the parse invalidates the existing plan, but
                  // keeps the literatureQC + references — the user can
                  // regenerate immediately with the corrected parse.
                  setLiteratureQC({ ...literatureQC, parsed_hypothesis: parsed });
                  setPlan(null);
                  setGenMeta(null);
                  setEvidenceMeta(null);
                  setCritique(null);
                  setSavedSincePlan(false);
                  setStage("literature_ready");
                  setToast("Parse updated. Regenerate the plan to use the corrected fields.");
                }}
                loading={stage === "plan_loading"}
              />
            )}
            {stage === "plan_loading" && (
              <LoadingCard
                label="Retrieving feedback and generating plan..."
                steps={[
                  "Refining supplier queries with the AI agent",
                  "Pulling Sigma / Thermo / Abcam catalog pages via Tavily",
                  "Pulling protocols and regulatory guidance",
                  "Extracting catalog numbers, prices, and concentrations",
                  "Retrieving relevant scientist feedback from past plans",
                  "Generating the executive summary, protocol, and budget",
                  "Running the AI plan critic for methodological gaps"
                ]}
              />
            )}
            {error && <ErrorBox message={error} />}
            {plan && (
              <PlanDashboard
                plan={plan}
                generation={genMeta}
                evidence={evidenceMeta}
                critique={critique}
                savedSincePlan={savedSincePlan}
                onRegenerate={generatePlan}
                onEdit={setTarget}
              />
            )}
          </section>

          <aside className="space-y-6">
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <ClipboardCheck className="h-5 w-5 text-blue-600" /> Judge Demo
              </h2>
              <ol className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Click a sample or enter your own hypothesis.</li>
                <li>Run Literature QC.</li>
                <li>Generate plan.</li>
                <li>Edit/correct validation or protocol.</li>
                <li>Regenerate and show Applied Scientist Feedback.</li>
              </ol>
            </Card>
            <Card>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <BrainCircuit className="h-5 w-5 text-emerald-600" /> Feedback Store
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {feedbackCount} saved scientist correction{feedbackCount === 1 ? "" : "s"}.
              </p>
              <div className="mt-3 space-y-3">
                {recentFeedback.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                    No feedback yet. Save a correction to demonstrate learning.
                  </p>
                ) : (
                  recentFeedback.map((fb) => (
                    <div key={fb.id} className="rounded-xl border bg-slate-50 p-3 text-sm">
                      <div className="font-medium text-slate-900">{fb.item_type} · {fb.severity}</div>
                      <p className="mt-1 text-slate-600">{fb.derived_rule}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
                <button
                  onClick={() => void runFeedbackAction("seed")}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Seed demo feedback
                </button>
                <button
                  onClick={() => void runFeedbackAction("reset")}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Reset feedback
                </button>
              </div>
            </Card>
          </aside>
        </div>
      </div>
      {target && (
        <FeedbackModal
          target={target}
          onClose={() => setTarget(null)}
          onSave={saveFeedback}
        />
      )}
      <DeploymentFooter health={health} />
    </main>
  );
}

function DeploymentFooter({ health }: { health: HealthResponse | null }) {
  const v = health?.env?.vercel;
  const node = health?.env?.nodeVersion;
  const model = health?.env?.openaiModel;
  if (!v && !node) return null;
  const repoUrl =
    v?.gitProvider && v.gitRepoOwner && v.gitRepoSlug && v.gitCommitSha
      ? v.gitProvider === "github"
        ? `https://github.com/${v.gitRepoOwner}/${v.gitRepoSlug}/commit/${v.gitCommitSha}`
        : null
      : null;
  return (
    <div className="mx-auto max-w-7xl px-4 pb-8 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/60 px-4 py-2 text-xs text-slate-500 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>The AI Scientist</span>
          {v?.onVercel ? (
            <span>
              · Vercel <span className="font-semibold text-slate-700">{v.env ?? "unknown"}</span>
              {v.region ? <> · region {v.region}</> : null}
            </span>
          ) : (
            <span>· local</span>
          )}
          {model && <span>· model {model}</span>}
          {node && <span>· Node {node}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {v?.gitCommitShortSha && (
            <span>
              build{" "}
              {repoUrl ? (
                <a className="font-mono text-blue-700 hover:underline" href={repoUrl} target="_blank" rel="noreferrer">
                  {v.gitCommitShortSha}
                </a>
              ) : (
                <span className="font-mono text-slate-700">{v.gitCommitShortSha}</span>
              )}
              {v.gitCommitRef ? <span> on {v.gitCommitRef}</span> : null}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadges({ health, feedbackCount }: { health: HealthResponse | null; feedbackCount: number }) {
  const env = health?.env;
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone={env?.openaiConfigured ? "emerald" : "amber"}>
        OpenAI {env?.openaiConfigured ? "on" : "fallback"}
      </Badge>
      <Badge tone={env?.tavilyConfigured ? "emerald" : "amber"}>
        Tavily {env?.tavilyConfigured ? "on" : "fallback"}
      </Badge>
      <Badge tone={env?.semanticScholarConfigured ? "emerald" : "slate"}>
        Semantic Scholar {env?.semanticScholarConfigured ? "keyed" : "public"}
      </Badge>
      <Badge tone={health?.feedbackStore.readable ? "emerald" : "red"}>
        Feedback {feedbackCount}
      </Badge>
      {env?.demoFallbackEnabled && <Badge tone="blue">Demo fallback on</Badge>}
    </div>
  );
}

type ReferenceGroupKey = "peer_reviewed" | "preprint" | "protocol" | "news_blog";

const REFERENCE_GROUP_META: Record<
  ReferenceGroupKey,
  { label: string; tone: "blue" | "amber" | "emerald" | "slate"; icon: React.ComponentType<{ className?: string }> }
> = {
  peer_reviewed: { label: "Peer-reviewed", tone: "blue", icon: BookOpen },
  preprint: { label: "Preprint", tone: "amber", icon: FlaskConical },
  protocol: { label: "Protocol / repository", tone: "emerald", icon: ClipboardCheck },
  news_blog: { label: "News & coverage", tone: "slate", icon: Newspaper }
};

function classifyReference(ref: Reference): ReferenceGroupKey {
  if (ref.source === "arxiv") return "preprint";
  if (ref.source === "protocol_repository") return "protocol";
  if (ref.source === "tavily") {
    if (ref.evidence_type === "protocol") return "protocol";
    return "news_blog";
  }
  return "peer_reviewed";
}

function sourceLabel(ref: Reference): string {
  const map: Record<string, string> = {
    semantic_scholar: "Semantic Scholar",
    arxiv: "arXiv",
    pubmed: "PubMed",
    openalex: "OpenAlex",
    crossref: "Crossref",
    tavily: "Tavily web",
    protocol_repository: "Protocol repo",
    supplier: "Supplier",
    manual: "Manual",
    demo_fallback: "Demo"
  };
  return map[ref.source] ?? ref.source;
}

function ReferenceList({ references }: { references: Reference[] }) {
  if (references.length === 0) {
    return (
      <div className="mt-4">
        <h3 className="font-semibold text-slate-900">References</h3>
        <p className="mt-2 text-sm text-slate-500">No references retrieved.</p>
      </div>
    );
  }
  const groups = (Object.keys(REFERENCE_GROUP_META) as ReferenceGroupKey[])
    .map((key) => ({
      key,
      meta: REFERENCE_GROUP_META[key],
      items: references.filter((r) => classifyReference(r) === key)
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-slate-900">
          References <span className="font-normal text-slate-500">({references.length})</span>
        </h3>
        <span className="text-xs text-slate-500">Click any title to open the source.</span>
      </div>
      <div className="mt-3 space-y-4">
        {groups.map(({ key, meta, items }) => {
          const Icon = meta.icon;
          return (
            <div key={key}>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Icon className="h-3.5 w-3.5" />
                <span>{meta.label}</span>
                <span className="text-slate-400">· {items.length}</span>
              </div>
              <div className="mt-2 space-y-2">
                {items.map((ref) => {
                  const hasUrl = ref.url && ref.url !== "not_found";
                  const Wrapper = hasUrl ? "a" : "div";
                  const wrapperProps = hasUrl
                    ? {
                        href: ref.url,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className:
                          "group block rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm transition-colors hover:border-blue-300 hover:bg-white"
                      }
                    : { className: "block rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" };
                  return (
                    <Wrapper key={ref.id} {...(wrapperProps as Record<string, unknown>)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-medium text-slate-900 group-hover:text-blue-700">
                          {ref.title}
                        </div>
                        {hasUrl && (
                          <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-600" />
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <Badge tone={meta.tone}>{sourceLabel(ref)}</Badge>
                        {ref.year && <span>{ref.year}</span>}
                        {ref.venue && <span>· {ref.venue}</span>}
                        {ref.relevance_score > 0 && (
                          <span>· score {Math.round(ref.relevance_score * 100) / 100}</span>
                        )}
                      </div>
                      {ref.relevance_reason && (
                        <p className="mt-1 text-xs leading-5 text-slate-600">{ref.relevance_reason}</p>
                      )}
                    </Wrapper>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParsedHypothesisEditor({
  initial,
  onSave,
  onCancel
}: {
  initial: ParsedHypothesis;
  onSave: (parsed: ParsedHypothesis) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ParsedHypothesis>(initial);
  const fields: { key: keyof ParsedHypothesis; label: string; multiline?: boolean }[] = [
    { key: "domain", label: "Domain" },
    { key: "experiment_type", label: "Experiment type" },
    { key: "organism_or_system", label: "System / organism" },
    { key: "intervention", label: "Intervention", multiline: true },
    { key: "comparator", label: "Comparator", multiline: true },
    { key: "primary_outcome", label: "Primary outcome", multiline: true },
    { key: "quantitative_target", label: "Quantitative target" },
    { key: "mechanism", label: "Mechanism", multiline: true }
  ];
  return (
    <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="text-sm text-slate-600">
        Correct the parse before generating the plan. Lists (controls, variables, safety
        flags) stay as the AI / heuristic produced them.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.multiline ? "md:col-span-2" : undefined}>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {f.label}
            </label>
            {f.multiline ? (
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                rows={2}
                value={draft[f.key] as string}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }) as ParsedHypothesis)
                }
              />
            ) : (
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                value={draft[f.key] as string}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [f.key]: e.target.value }) as ParsedHypothesis)
                }
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(draft)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

function LiteratureCard({
  qc,
  diagnostics,
  onGenerate,
  onUpdateParsed,
  loading
}: {
  qc: LiteratureQC;
  diagnostics: LiteratureDiagnostics | null;
  onGenerate: () => void;
  onUpdateParsed: (parsed: ParsedHypothesis) => void;
  loading: boolean;
}) {
  const [editingParse, setEditingParse] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
            <BookOpen className="h-5 w-5 text-blue-600" /> Stage B — Literature QC
          </h2>
          <p className="mt-1 text-sm text-slate-600">Rapid novelty signal, not a systematic review.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge tone={qc.novelty.signal === "exact_match_found" ? "red" : qc.novelty.signal === "similar_work_exists" ? "amber" : "emerald"}>
            {qc.novelty.signal.replaceAll("_", " ")}
          </Badge>
          {diagnostics && (
            <div className="flex flex-wrap gap-1">
              <Badge tone={diagnostics.parseSource === "openai" ? "emerald" : "amber"}>
                Parsed by {diagnostics.parseSource === "openai" ? `AI · ${diagnostics.parseModel ?? "openai"}` : "heuristic"}
              </Badge>
              <Badge
                tone={
                  diagnostics.noveltySource === "openai"
                    ? "emerald"
                    : diagnostics.noveltySource === "heuristic"
                      ? "amber"
                      : "red"
                }
              >
                Novelty {diagnostics.noveltySource === "openai"
                  ? `AI · ${diagnostics.noveltyModel ?? "openai"}`
                  : diagnostics.noveltySource === "heuristic"
                    ? "heuristic"
                    : "demo fallback"}
              </Badge>
              {diagnostics.sources.length > 0 && (
                <Badge tone="slate">live: {diagnostics.sources.join(", ")}</Badge>
              )}
              {diagnostics.sourceStats && diagnostics.sourceStats.length > 0 && (
                <details className="text-xs text-slate-600">
                  <summary className="cursor-pointer underline">search sources</summary>
                  <ul className="mt-1 list-disc pl-4">
                    {diagnostics.sourceStats.map((s) => (
                      <li
                        key={s.name}
                        className={
                          s.status === "ok"
                            ? "text-emerald-700"
                            : s.status === "error"
                              ? "text-rose-700"
                              : "text-slate-500"
                        }
                      >
                        {s.name}: {s.status} ({s.count} hit{s.count === 1 ? "" : "s"}, {s.durationMs} ms)
                        {s.error ? ` — ${s.error}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-sm text-slate-600">
          <span>Confidence</span>
          <span>{Math.round(qc.novelty.confidence * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${qc.novelty.confidence * 100}%` }} />
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700">{qc.novelty.rationale}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Parsed hypothesis
        </h3>
        {!editingParse ? (
          <button
            onClick={() => setEditingParse(true)}
            className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            Edit parse
          </button>
        ) : (
          <span className="text-xs text-slate-500">
            Editing — save to apply, then regenerate the plan.
          </span>
        )}
      </div>
      {editingParse ? (
        <ParsedHypothesisEditor
          initial={qc.parsed_hypothesis}
          onSave={(p) => {
            onUpdateParsed(p);
            setEditingParse(false);
          }}
          onCancel={() => setEditingParse(false)}
        />
      ) : (
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <MiniField label="Domain" value={qc.parsed_hypothesis.domain} />
          <MiniField label="Experiment Type" value={qc.parsed_hypothesis.experiment_type} />
          <MiniField label="System" value={qc.parsed_hypothesis.organism_or_system} />
          <MiniField label="Outcome" value={qc.parsed_hypothesis.primary_outcome} />
          <MiniField label="Intervention" value={qc.parsed_hypothesis.intervention} />
          <MiniField label="Comparator" value={qc.parsed_hypothesis.comparator} />
        </div>
      )}
      <ReferenceList references={qc.novelty.references} />
      {qc.novelty.coverage_warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-semibold">Coverage warnings</div>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {qc.novelty.coverage_warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}
      <button
        onClick={onGenerate}
        disabled={loading}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
      >
        <FlaskConical className="h-4 w-4" />
        {loading ? "Generating..." : "Generate Experiment Plan"}
      </button>
    </Card>
  );
}

function PlanDashboard({
  plan,
  generation,
  evidence,
  critique,
  savedSincePlan,
  onRegenerate,
  onEdit
}: {
  plan: ExperimentPlan;
  generation: PlanGenerationMeta | null;
  evidence: EvidenceMeta | null;
  critique: PlanCritiqueMeta | null;
  savedSincePlan: boolean;
  onRegenerate: () => void;
  onEdit: (target: FeedbackTarget) => void;
}) {
  const confidence = computePlanConfidence(plan);
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <Beaker className="h-5 w-5 text-blue-600" /> Stage C — Plan Dashboard
            </h2>
            <p className="mt-1 text-sm text-slate-500">Plan ID: {plan.plan_id}</p>
            {generation && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    generation.source === "openai"
                      ? "emerald"
                      : generation.source === "safety_restricted"
                        ? "red"
                        : "amber"
                  }
                >
                  {generation.source === "openai"
                    ? `Generated by ${generation.model ?? "OpenAI"}`
                    : generation.source === "safety_restricted"
                      ? "Safety-restricted plan"
                      : "Deterministic fallback (no AI)"}
                </Badge>
                {generation.attempts > 0 && (
                  <Badge tone="slate">{generation.attempts} attempt{generation.attempts === 1 ? "" : "s"}</Badge>
                )}
                {generation.errors.length > 0 && (
                  <details className="text-xs text-amber-800">
                    <summary className="cursor-pointer underline">{generation.errors.length} note{generation.errors.length === 1 ? "" : "s"}</summary>
                    <ul className="mt-1 list-disc pl-5">
                      {generation.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                downloadText(
                  `${plan.plan_id}.json`,
                  JSON.stringify(
                    {
                      ...plan,
                      _generation: generation ?? undefined,
                      _evidence: evidence ?? undefined,
                      _critique: critique ?? undefined
                    },
                    null,
                    2
                  ),
                  "application/json"
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Export JSON
            </button>
            <button
              onClick={() =>
                downloadText(
                  `${plan.plan_id}.md`,
                  planToMarkdown(plan, critique),
                  "text/markdown"
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Export Markdown
            </button>
            {savedSincePlan && (
              <button
                onClick={onRegenerate}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <RefreshCw className="h-4 w-4" /> Regenerate with Feedback
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <MiniField label="Objective" value={plan.executive_summary.objective} />
          <MiniField label="Decision Gate" value={plan.executive_summary.decision_gate} />
        </div>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-blue-950">Plan confidence</h3>
              <p className="mt-1 text-sm text-blue-800">
                Composite score from evidence quality, supplier completeness, validation completeness,
                and feedback relevance.
              </p>
            </div>
            <Badge tone={confidence.score >= 75 ? "emerald" : confidence.score >= 50 ? "blue" : "amber"}>
              {confidence.score}/100 · {confidence.label}
            </Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${confidence.score}%` }}
            />
          </div>
          <div className="mt-3 grid gap-2 text-xs text-blue-900 sm:grid-cols-4">
            <span>Evidence {confidence.parts.evidence}/40</span>
            <span>Suppliers {confidence.parts.suppliers}/20</span>
            <span>Validation {confidence.parts.validation}/20</span>
            <span>Feedback {confidence.parts.feedback}/20</span>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-700">{plan.executive_summary.experimental_strategy}</p>
      </Card>

      {evidence && <EvidenceDiagnosticsCard evidence={evidence} />}

      {critique && <PlanCritiquePanel critique={critique} />}

      <SectionCard title="Applied Scientist Feedback" icon={<BrainCircuit className="h-5 w-5 text-emerald-600" />}>
        {plan.applied_feedback.length === 0 ? (
          <p className="text-sm text-slate-500">No relevant saved feedback was applied yet.</p>
        ) : (
          <div className="space-y-3">
            {plan.applied_feedback.map((fb) => (
              <div key={fb.feedback_id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={fb.severity === "critical" ? "red" : "emerald"}>{fb.severity}</Badge>
                  <Badge tone="slate">score {fb.similarity_score.toFixed(2)}</Badge>
                  <Badge tone="slate">{fb.source_item_type}</Badge>
                </div>
                <p className="mt-2 font-medium text-emerald-950">{fb.derived_rule}</p>
                <p className="mt-1 text-emerald-800">{fb.reason_applied}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Safety / Ethics / Compliance" icon={<ShieldAlert className="h-5 w-5 text-red-600" />}>
        <div className="grid gap-3 md:grid-cols-2">
          <MiniField label="Risk Level" value={plan.safety_ethics_compliance.overall_risk_level} />
          <MiniField label="Biosafety Assumption" value={plan.safety_ethics_compliance.biosafety_level_assumption} />
          <MiniField label="Human Samples" value={plan.safety_ethics_compliance.human_subjects_or_samples} />
          <MiniField label="Animal Work" value={plan.safety_ethics_compliance.animal_work} />
        </div>
        <ListBlock title="Approvals" items={plan.safety_ethics_compliance.required_approvals} />
        <ListBlock title="Critical warnings" items={plan.safety_ethics_compliance.critical_warnings} tone="red" />
        <EditButton onClick={() => onEdit(contextTarget("safety", "safety", plan.safety_ethics_compliance))} />
      </SectionCard>

      <SectionCard title="Protocol Plan" icon={<ClipboardCheck className="h-5 w-5 text-blue-600" />}>
        <div className="space-y-3">
          {plan.protocol.map((step) => (
            <div key={step.id} className="rounded-xl border bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{step.purpose}</p>
                </div>
                <EditButton onClick={() => onEdit(contextTarget("protocol", step.id, step))} compact />
              </div>
              <ListBlock title="Review instructions" items={step.instructions} />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Materials and Supply Chain" icon={<ShoppingCart className="h-5 w-5 text-blue-600" />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2">Item</th>
                <th>Supplier</th>
                <th>Catalog</th>
                <th>Cost</th>
                <th>Confidence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {plan.materials.map((m) => {
                const isApprox = typeof m.notes === "string" && m.notes.includes("[approx_estimate]");
                return (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-3 font-medium text-slate-900">
                      {m.name}
                      <div className="font-normal text-slate-500">{m.purpose}</div>
                    </td>
                    <td>{m.supplier}</td>
                    <td>{m.catalog_number === "not_found" ? <Badge tone="amber">not found</Badge> : m.catalog_number}</td>
                    <td>
                      {m.estimated_cost === null ? (
                        "—"
                      ) : isApprox ? (
                        <span
                          className="inline-flex items-center gap-1.5"
                          title="AI-estimated approximation, not a vendor quote. Verify before ordering."
                        >
                          <span className="text-slate-700">~${m.estimated_cost}</span>
                          <Badge tone="amber">approx</Badge>
                        </span>
                      ) : (
                        `$${m.estimated_cost}`
                      )}
                    </td>
                    <td><Badge tone={m.confidence === "high" ? "emerald" : m.confidence === "medium" ? "blue" : "amber"}>{m.confidence}</Badge></td>
                    <td><EditButton onClick={() => onEdit(contextTarget("material", m.id, m))} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Budget" icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}>
          <div className="space-y-2 text-sm">
            <Row label="Materials subtotal" value={`$${plan.budget.material_line_items_total.toFixed(2)}`} />
            <Row label="Equipment if needed" value={`$${plan.budget.equipment_line_items_total_if_needed.toFixed(2)}`} />
            <Row label="Contingency" value={`$${plan.budget.contingency_amount.toFixed(2)} (${plan.budget.contingency_percent}%)`} />
            <Row label="Estimated total" value={`$${plan.budget.estimated_total.toFixed(2)}`} strong />
          </div>
          <p className="mt-3 text-sm text-slate-600">{plan.budget.calculation_notes}</p>
          <EditButton onClick={() => onEdit(contextTarget("budget", "budget", plan.budget))} />
        </SectionCard>
        <SectionCard title="Timeline" icon={<RefreshCw className="h-5 w-5 text-blue-600" />}>
          <div className="space-y-3">
            {plan.timeline.map((p) => (
              <div key={p.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between gap-4">
                  <b>{p.name}</b>
                  <span className="text-slate-500">{p.duration}</span>
                </div>
                <p className="mt-1 text-slate-600">{p.decision_gate}</p>
                <EditButton onClick={() => onEdit(contextTarget("timeline", p.id, p))} compact />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Validation and Controls" icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}>
        <MiniField label="Primary readout" value={plan.validation.primary_readout} />
        <ListBlock title="Success criteria" items={plan.validation.success_criteria} />
        <ListBlock title="Failure criteria" items={plan.validation.failure_criteria} />
        <h3 className="mt-4 font-semibold text-slate-900">Controls</h3>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {plan.validation.controls.map((c) => (
            <div key={c.id} className="rounded-xl border bg-slate-50 p-3 text-sm">
              <div className="flex justify-between gap-2">
                <b>{c.name}</b>
                <Badge tone="slate">{c.control_type}</Badge>
              </div>
              <p className="mt-1 text-slate-600">{c.purpose}</p>
              <EditButton onClick={() => onEdit(contextTarget("control", c.id, c))} compact />
            </div>
          ))}
        </div>
        <EditButton onClick={() => onEdit(contextTarget("validation", "validation", plan.validation))} />
      </SectionCard>

      <SectionCard title="Risks, Assumptions, Evidence Quality" icon={<BookOpen className="h-5 w-5 text-blue-600" />}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="font-semibold text-slate-900">Risks</h3>
            {plan.risks_and_mitigations.map((r) => (
              <div key={r.id} className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                <b>{r.risk}</b>
                <p className="mt-1 text-slate-600">{r.mitigation}</p>
                <EditButton onClick={() => onEdit(contextTarget("risk", r.id, r))} compact />
              </div>
            ))}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Assumptions</h3>
            {plan.assumptions.map((a) => (
              <div key={a.id} className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                <b>{a.assumption}</b>
                <p className="mt-1 text-slate-600">{a.how_to_verify}</p>
                <EditButton onClick={() => onEdit(contextTarget("assumption", a.id, a))} compact />
              </div>
            ))}
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Evidence</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="blue">Literature {plan.evidence_quality.literature_coverage}</Badge>
              <Badge tone="amber">Supplier {plan.evidence_quality.supplier_data_confidence}</Badge>
              <Badge tone="emerald">Protocol {plan.evidence_quality.protocol_grounding_confidence}</Badge>
            </div>
            <ListBlock title="Known gaps" items={plan.evidence_quality.known_gaps} />
          </div>
        </div>
        <div className="mt-6 border-t pt-4">
          <h3 className="font-semibold text-slate-900">Evidence Cards</h3>
          {plan.evidence_quality.evidence_cards.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No evidence cards were available for this generation.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {plan.evidence_quality.evidence_cards.map((card) => (
                <details key={card.id} className="rounded-xl border bg-slate-50 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-slate-950">
                    {card.title}
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="slate">{card.source_type}</Badge>
                    <Badge
                      tone={
                        card.confidence === "high"
                          ? "emerald"
                          : card.confidence === "medium"
                            ? "blue"
                            : "amber"
                      }
                    >
                      {card.confidence}
                    </Badge>
                    <Badge tone="slate">{card.source_name}</Badge>
                  </div>
                  <p className="mt-3 leading-6 text-slate-600">{card.snippet}</p>
                  {card.extracted_facts.length > 0 && (
                    <ListBlock title="Extracted facts" items={card.extracted_facts} />
                  )}
                  {card.source_url !== "not_found" && (
                    <a
                      className="mt-3 inline-block font-semibold text-blue-700 hover:underline"
                      href={card.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open source
                    </a>
                  )}
                </details>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function FeedbackModal({
  target,
  onClose,
  onSave
}: {
  target: FeedbackTarget;
  onClose: () => void;
  onSave: (payload: {
    correction: string;
    reason: string;
    rating_before: number | null;
    tags: string[];
    applicability: ScientistFeedback["applicability"];
    severity: ScientistFeedback["severity"];
    confidence: number;
  }) => Promise<void>;
}) {
  const [correction, setCorrection] = useState("");
  const [reason, setReason] = useState("");
  const [rating, setRating] = useState("3");
  const [tags, setTags] = useState("validation, controls");
  const [applicability, setApplicability] = useState<ScientistFeedback["applicability"]>("similar_experiment_type");
  const [severity, setSeverity] = useState<ScientistFeedback["severity"]>("important");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const correctionRef = useRef<HTMLTextAreaElement>(null);

  // Lock body scroll while the modal is open so the page underneath doesn't
  // scroll along with it on touch devices.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape and autofocus the first input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    correctionRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!correction.trim() || !reason.trim()) {
      setError("Correction and reason are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        correction,
        reason,
        rating_before: rating ? Number(rating) : null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        applicability,
        severity,
        confidence: 0.75
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="feedback-modal-title" className="text-xl font-semibold text-slate-950">
          Scientist correction
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Turn expert review into reusable guidance for future similar plans.
        </p>
        <div className="mt-4 rounded-xl border bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">{target.label}</div>
          <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {target.original_context}
          </pre>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="feedback-correction">
          Corrected text
        </label>
        <textarea
          id="feedback-correction"
          ref={correctionRef}
          className="mt-1 w-full rounded-xl border p-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          rows={4}
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
        />
        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="feedback-reason">
          Reason
        </label>
        <textarea
          id="feedback-reason"
          className="mt-1 w-full rounded-xl border p-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Select label="Rating" value={rating} onChange={setRating} options={["1", "2", "3", "4", "5"]} />
          <Select label="Applicability" value={applicability} onChange={(v) => setApplicability(v as ScientistFeedback["applicability"])} options={["only_this_plan", "similar_experiment_type", "broad_rule"]} />
          <Select label="Severity" value={severity} onChange={(v) => setSeverity(v as ScientistFeedback["severity"])} options={["minor", "important", "critical"]} />
          <div>
            <label className="block text-sm font-medium text-slate-700">Tags</label>
            <input className="mt-1 w-full rounded-xl border p-2 text-sm" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{children}</div>;
}

function SectionCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-950">{icon}{title}</h2>
      {children}
    </Card>
  );
}

function Badge({ tone, children }: { tone: "blue" | "emerald" | "amber" | "red" | "slate"; children: React.ReactNode }) {
  const classes = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700"
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>{children}</span>;
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm leading-5 text-slate-800">{value}</div>
    </div>
  );
}

function PlanCritiquePanel({ critique }: { critique: PlanCritiqueMeta }) {
  const overallTone =
    critique.overall_assessment === "weak"
      ? "red"
      : critique.overall_assessment === "needs_work"
        ? "amber"
        : "emerald";
  const sourceLabel = critique.source === "openai" ? `AI critic · ${critique.model ?? "OpenAI"}` : "Heuristic critic";
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <ClipboardCheck className="h-5 w-5 text-blue-600" /> AI Plan Critic
        </h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone={critique.source === "openai" ? "emerald" : "amber"}>{sourceLabel}</Badge>
          <Badge tone={overallTone}>
            {critique.overall_assessment === "solid"
              ? "Solid"
              : critique.overall_assessment === "needs_work"
                ? "Needs work"
                : "Weak"}
          </Badge>
          <Badge tone="slate">
            {critique.findings.length} finding{critique.findings.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </div>
      {critique.findings.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No issues detected. The critic still recommends a domain-expert review before execution.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {critique.findings.map((f, i) => {
            const tone = f.severity === "critical" ? "red" : f.severity === "warning" ? "amber" : "blue";
            return (
              <li key={i} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone}>{f.severity}</Badge>
                  <Badge tone="slate">{f.area}</Badge>
                </div>
                <p className="mt-2 font-medium text-slate-900">{f.finding}</p>
                <p className="mt-1 text-slate-600">
                  <span className="font-semibold text-slate-700">Suggestion: </span>
                  {f.suggestion}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {critique.errors.length > 0 && (
        <details className="mt-3 text-xs text-amber-800">
          <summary className="cursor-pointer underline">{critique.errors.length} note{critique.errors.length === 1 ? "" : "s"}</summary>
          <ul className="mt-1 list-disc pl-5">
            {critique.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function EvidenceDiagnosticsCard({ evidence }: { evidence: EvidenceMeta }) {
  const labelMap: Record<string, string> = {
    tavily_protocols: "Protocols",
    tavily_suppliers: "Suppliers",
    tavily_regulatory: "Regulatory"
  };
  const subtitleMap: Record<string, string> = {
    tavily_protocols: "protocols.io · JoVE · Bio-protocol · STAR Protocols",
    tavily_suppliers: "Sigma · Thermo Fisher · Abcam · Bio-Rad · Tocris",
    tavily_regulatory: "IRB · IACUC · IBC · CDC · NIH · FDA"
  };
  const toneFor = (s: EvidenceSourceStat["status"]): "emerald" | "slate" | "red" | "amber" => {
    switch (s) {
      case "ok":
        return "emerald";
      case "empty":
        return "slate";
      case "error":
        return "red";
      case "skipped":
      default:
        return "amber";
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <BookOpen className="h-5 w-5 text-blue-600" /> Evidence pipeline
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Live web retrieval used to ground materials, protocols, and regulatory flags.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={evidence.tavilyConfigured ? "emerald" : "amber"}>
            Tavily {evidence.tavilyConfigured ? "configured" : "not configured"}
          </Badge>
          <Badge tone="slate">
            {evidence.cardCount} evidence card{evidence.cardCount === 1 ? "" : "s"}
          </Badge>
          {evidence.regulatoryReasons.length > 0 && (
            <Badge tone="amber">
              Oversight: {evidence.regulatoryReasons.length} flag
              {evidence.regulatoryReasons.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {evidence.sourceStats.map((s) => (
          <div key={s.name} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">
                {labelMap[s.name] ?? s.name}
              </span>
              <Badge tone={toneFor(s.status)}>{s.status}</Badge>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {subtitleMap[s.name] ?? s.name}
            </div>
            <div className="mt-2 text-slate-600">
              {s.count} hit{s.count === 1 ? "" : "s"} · {s.durationMs} ms
            </div>
            {s.error && (
              <div className="mt-1 line-clamp-2 text-rose-600" title={s.error}>
                {s.error}
              </div>
            )}
          </div>
        ))}
      </div>
      {evidence.regulatoryReasons.length > 0 && (
        <details className="mt-3 text-xs text-amber-800">
          <summary className="cursor-pointer underline">
            Why oversight evidence was searched
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {evidence.regulatoryReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function ListBlock({ title, items, tone = "slate" }: { title: string; items: string[]; tone?: "slate" | "red" }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <ul className={`mt-2 list-disc space-y-1 pl-5 text-sm ${tone === "red" ? "text-red-800" : "text-slate-600"}`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 border-b py-2 last:border-0 ${strong ? "font-semibold text-slate-950" : "text-slate-700"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function EditButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`${compact ? "mt-2 px-2.5 py-1.5 text-xs" : "mt-4 px-3 py-2 text-sm"} rounded-lg border border-blue-200 bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100`}
    >
      Edit / Correct
    </button>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <select className="mt-1 w-full rounded-xl border p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => <option key={opt}>{opt}</option>)}
      </select>
    </div>
  );
}

function LoadingCard({ label, steps = [] }: { label: string; steps?: string[] }) {
  // Rotate the live status messages so a 30-second plan generation feels
  // alive instead of a single frozen label.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (steps.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 2200);
    return () => clearInterval(id);
  }, [steps.length]);
  const subLabel = steps.length > 0 ? steps[tick % steps.length] : null;
  return (
    <Card>
      <div className="flex items-center gap-3 text-slate-600">
        <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
        <span className="font-medium text-slate-700">{label}</span>
      </div>
      {subLabel && (
        <div className="mt-2 text-sm text-slate-500" aria-live="polite">
          {subLabel}
        </div>
      )}
      <div className="mt-4 space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
      </div>
    </Card>
  );
}

function StageProgress({ stage }: { stage: Stage }) {
  // Order maps to the user-facing stages of the workflow.
  const steps: { key: Stage[]; label: string }[] = [
    { key: ["input", "literature_loading", "error"], label: "Hypothesis" },
    { key: ["literature_loading", "literature_ready", "plan_loading", "plan_ready"], label: "Literature QC" },
    { key: ["plan_loading", "plan_ready"], label: "Experiment Plan" }
  ];
  // Index of the rightmost step that the stage matches; everything up to
  // (and including) it is considered "active".
  const activeIdx = (() => {
    if (stage === "plan_ready" || stage === "plan_loading") return 2;
    if (stage === "literature_ready" || stage === "literature_loading") return 1;
    return 0;
  })();
  const isLoading = stage === "literature_loading" || stage === "plan_loading";
  return (
    <div className="mb-6 flex items-center gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs font-semibold text-slate-500 backdrop-blur md:text-sm">
      {steps.map((step, i) => {
        const active = i <= activeIdx;
        const current = i === activeIdx && isLoading;
        return (
          <div key={step.label} className="flex items-center gap-3">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                active
                  ? current
                    ? "animate-pulse border-blue-600 bg-blue-600 text-white"
                    : "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-400"
              }`}
              aria-current={current ? "step" : undefined}
            >
              {i + 1}
            </div>
            <span className={active ? "text-slate-900" : "text-slate-400"}>{step.label}</span>
            {i < steps.length - 1 && <span className="text-slate-300">·</span>}
          </div>
        );
      })}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <b>Error:</b> {message}
    </div>
  );
}

function validateHypothesis(text: string): { ok: boolean; message?: string } {
  // Keep length-only sanity checks. The AI parser decides whether a query
  // is workable — vague or unconventional phrasings (e.g. "Synthesis of a
  // yolk-shell nanoparticle...") are passed through, and the pipeline
  // surfaces uncertainty via the parsed hypothesis + novelty rationale
  // instead of refusing input outright.
  const trimmed = text.trim();
  if (trimmed.length < 10) return { ok: false, message: "Add a few more words so the AI has something to work with." };
  if (text.length > 3000) return { ok: false, message: "Maximum 3000 characters." };
  return { ok: true };
}

function contextTarget(
  itemType: ScientistFeedback["item_type"],
  itemId: string,
  value: unknown
): FeedbackTarget {
  return {
    item_type: itemType,
    item_id: itemId,
    original_context: JSON.stringify(value, null, 2),
    label: `${itemType} · ${itemId}`
  };
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function planToMarkdown(plan: ExperimentPlan, critique: PlanCritiqueMeta | null = null): string {
  const lines: string[] = [];
  lines.push(`# The AI Scientist Plan`);
  lines.push("");
  lines.push(`- Plan ID: ${plan.plan_id}`);
  lines.push(`- Created: ${plan.created_at}`);
  lines.push(`- Domain: ${plan.hypothesis.parsed.domain}`);
  lines.push(`- Experiment type: ${plan.hypothesis.parsed.experiment_type}`);
  lines.push("");
  lines.push(`## Hypothesis`);
  lines.push(plan.hypothesis.raw);
  lines.push("");
  lines.push(`## Executive Summary`);
  lines.push(`**Objective:** ${plan.executive_summary.objective}`);
  lines.push("");
  lines.push(`**Strategy:** ${plan.executive_summary.experimental_strategy}`);
  lines.push("");
  lines.push(`**Expected result:** ${plan.executive_summary.expected_result}`);
  lines.push("");
  lines.push(`**Decision gate:** ${plan.executive_summary.decision_gate}`);
  lines.push("");
  lines.push(`## Novelty`);
  lines.push(`Signal: ${plan.novelty.signal}`);
  lines.push(`Confidence: ${Math.round(plan.novelty.confidence * 100)}%`);
  lines.push(plan.novelty.rationale);
  lines.push("");
  lines.push(`## Applied Scientist Feedback`);
  if (plan.applied_feedback.length === 0) {
    lines.push("No prior feedback was applied.");
  } else {
    for (const feedback of plan.applied_feedback) {
      lines.push(
        `- [${feedback.severity}, score ${feedback.similarity_score.toFixed(2)}] ${feedback.derived_rule}`
      );
    }
  }
  lines.push("");
  lines.push(`## Safety / Ethics / Compliance`);
  lines.push(`Risk level: ${plan.safety_ethics_compliance.overall_risk_level}`);
  lines.push(`Biosafety assumption: ${plan.safety_ethics_compliance.biosafety_level_assumption}`);
  lines.push(`Human samples: ${plan.safety_ethics_compliance.human_subjects_or_samples}`);
  lines.push(`Animal work: ${plan.safety_ethics_compliance.animal_work}`);
  lines.push("");
  lines.push(`Required approvals:`);
  for (const approval of plan.safety_ethics_compliance.required_approvals) {
    lines.push(`- ${approval}`);
  }
  lines.push("");
  lines.push(`Critical warnings:`);
  for (const warning of plan.safety_ethics_compliance.critical_warnings) {
    lines.push(`- ${warning}`);
  }
  lines.push("");
  lines.push(`## Protocol Plan`);
  for (const step of plan.protocol) {
    lines.push(`### ${step.title}`);
    lines.push(step.purpose);
    for (const instruction of step.instructions) {
      lines.push(`- ${instruction}`);
    }
    lines.push("");
  }
  lines.push(`## Materials`);
  for (const material of plan.materials) {
    lines.push(
      `- ${material.name}: ${material.supplier}; catalog ${material.catalog_number}; estimated cost ${
        material.estimated_cost ?? "unknown"
      } ${material.currency}; confidence ${material.confidence}`
    );
  }
  lines.push("");
  lines.push(`## Budget`);
  lines.push(`- Material subtotal: ${plan.budget.currency} ${plan.budget.material_line_items_total}`);
  lines.push(
    `- Equipment if needed: ${plan.budget.currency} ${plan.budget.equipment_line_items_total_if_needed}`
  );
  lines.push(`- Contingency: ${plan.budget.contingency_percent}%`);
  lines.push(`- Estimated total: ${plan.budget.currency} ${plan.budget.estimated_total}`);
  lines.push(`- Notes: ${plan.budget.calculation_notes}`);
  lines.push("");
  lines.push(`## Timeline`);
  for (const phase of plan.timeline) {
    lines.push(`- ${phase.name} (${phase.duration}): ${phase.decision_gate}`);
  }
  lines.push("");
  lines.push(`## Validation`);
  lines.push(`Primary readout: ${plan.validation.primary_readout}`);
  lines.push("");
  lines.push(`Controls:`);
  for (const control of plan.validation.controls) {
    lines.push(`- ${control.name} (${control.control_type}): ${control.purpose}`);
  }
  lines.push("");
  lines.push(`Success criteria:`);
  for (const item of plan.validation.success_criteria) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push(`Failure criteria:`);
  for (const item of plan.validation.failure_criteria) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push(`## Risks`);
  for (const risk of plan.risks_and_mitigations) {
    lines.push(`- ${risk.risk} (${risk.severity}/${risk.likelihood}): ${risk.mitigation}`);
  }
  lines.push("");
  lines.push(`## Assumptions`);
  for (const assumption of plan.assumptions) {
    lines.push(`- ${assumption.assumption} Verify: ${assumption.how_to_verify}`);
  }
  lines.push("");
  lines.push(`## Evidence Quality`);
  const confidence = computePlanConfidence(plan);
  lines.push(`- Plan confidence: ${confidence.score}/100 (${confidence.label})`);
  lines.push(`- Literature coverage: ${plan.evidence_quality.literature_coverage}`);
  lines.push(`- Supplier confidence: ${plan.evidence_quality.supplier_data_confidence}`);
  lines.push(`- Protocol grounding: ${plan.evidence_quality.protocol_grounding_confidence}`);
  lines.push(`- Overall confidence: ${plan.evidence_quality.overall_plan_confidence}`);
  lines.push("");
  lines.push(`Known gaps:`);
  for (const gap of plan.evidence_quality.known_gaps) {
    lines.push(`- ${gap}`);
  }
  if (critique) {
    lines.push("");
    lines.push(`## AI Plan Critic`);
    const sourceLabel = critique.source === "openai" ? `OpenAI (${critique.model ?? "unknown model"})` : "Heuristic critic";
    lines.push(`- Source: ${sourceLabel}`);
    lines.push(`- Overall assessment: ${critique.overall_assessment.replaceAll("_", " ")}`);
    lines.push(`- Findings: ${critique.findings.length}`);
    if (critique.findings.length > 0) {
      lines.push("");
      for (const finding of critique.findings) {
        lines.push(`### [${finding.severity.toUpperCase()}] ${finding.area} — ${finding.finding}`);
        lines.push(`Suggestion: ${finding.suggestion}`);
        lines.push("");
      }
    }
    if (critique.errors.length > 0) {
      lines.push("Notes:");
      for (const e of critique.errors) lines.push(`- ${e}`);
      lines.push("");
    }
  }
  lines.push("");
  lines.push("> Generated for expert review. Do not execute without approved local SOPs and required institutional approvals.");
  return lines.join("\n");
}

function computePlanConfidence(plan: ExperimentPlan): {
  score: number;
  label: "low" | "medium" | "high";
  parts: { evidence: number; suppliers: number; validation: number; feedback: number };
} {
  const qualityScore = { low: 0.25, medium: 0.65, high: 1 };
  const evidence =
    Math.round(
      40 *
        average([
          qualityScore[plan.evidence_quality.literature_coverage],
          qualityScore[plan.evidence_quality.protocol_grounding_confidence],
          qualityScore[plan.evidence_quality.overall_plan_confidence]
        ])
    );

  const supplierKnown = plan.materials.length
    ? plan.materials.filter((m) => m.catalog_number !== "not_found" || m.estimated_cost !== null).length /
      plan.materials.length
    : 0;
  const supplierConfidence =
    qualityScore[plan.evidence_quality.supplier_data_confidence] * 0.5 + supplierKnown * 0.5;
  const suppliers = Math.round(20 * supplierConfidence);

  const validationSignals = [
    plan.validation.primary_readout.length > 0,
    plan.validation.controls.length >= 2,
    plan.validation.success_criteria.length > 0,
    plan.validation.failure_criteria.length > 0,
    plan.validation.data_quality_checks.length > 0,
    plan.validation.sample_size_rationale.length > 0,
    plan.validation.statistical_analysis.length > 0
  ];
  const validation = Math.round(
    20 * (validationSignals.filter(Boolean).length / validationSignals.length)
  );

  const feedback =
    plan.applied_feedback.length === 0
      ? 8
      : Math.min(20, 10 + Math.round(10 * Math.max(...plan.applied_feedback.map((f) => f.similarity_score))));

  const raw = evidence + suppliers + validation + feedback;
  const score = Math.max(0, Math.min(100, raw));
  const label = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return {
    score,
    label,
    parts: { evidence, suppliers, validation, feedback }
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
