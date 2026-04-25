"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Beaker,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
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

export default function Home() {
  const [hypothesis, setHypothesis] = useState(samples[0].text);
  const [stage, setStage] = useState<Stage>("input");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [literatureQC, setLiteratureQC] = useState<LiteratureQC | null>(null);
  const [plan, setPlan] = useState<ExperimentPlan | null>(null);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [recentFeedback, setRecentFeedback] = useState<ScientistFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<FeedbackTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savedSincePlan, setSavedSincePlan] = useState(false);

  useEffect(() => {
    void refreshHealthAndFeedback();
  }, []);

  const validation = useMemo(() => validateHypothesis(hypothesis), [hypothesis]);

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
    setPlan(null);
    setSavedSincePlan(false);
    try {
      const res = await fetch("/api/literature", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hypothesis })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Literature QC failed");
      setLiteratureQC(json);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Plan generation failed");
      setPlan(json);
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
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-slate-600 shadow-sm">
              <Sparkles className="h-4 w-4 text-blue-600" /> Hackathon prototype
            </div>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">
              The AI Scientist
            </h1>
            <p className="mt-2 text-lg text-slate-600">
              From scientific hypothesis to operational experiment plan
            </p>
          </div>
          <StatusBadges health={health} feedbackCount={feedbackCount} />
        </header>

        {toast && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span>{toast}</span>
            <button onClick={() => setToast(null)} className="font-semibold">
              Dismiss
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="space-y-6">
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">Stage A — Input</h2>
                  <p className="text-sm text-slate-600">
                    Enter a scientific hypothesis with an intervention, system, measurable outcome,
                    comparator, and target.
                  </p>
                </div>
                <Badge tone="blue">{hypothesis.length}/3000</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {samples.map((sample) => (
                  <button
                    key={sample.label}
                    className="rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => {
                      setHypothesis(sample.text);
                      setLiteratureQC(null);
                      setPlan(null);
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

            {stage === "literature_loading" && <LoadingCard label="Searching literature and parsing hypothesis..." />}
            {literatureQC && (
              <LiteratureCard
                qc={literatureQC}
                onGenerate={generatePlan}
                loading={stage === "plan_loading"}
              />
            )}
            {stage === "plan_loading" && <LoadingCard label="Retrieving feedback and generating plan..." />}
            {error && <ErrorBox message={error} />}
            {plan && (
              <PlanDashboard
                plan={plan}
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
                <li>1. Click Diagnostics.</li>
                <li>2. Run Literature QC.</li>
                <li>3. Generate plan.</li>
                <li>4. Edit/correct validation or protocol.</li>
                <li>5. Regenerate and show Applied Scientist Feedback.</li>
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
    </main>
  );
}

function StatusBadges({ health, feedbackCount }: { health: HealthResponse | null; feedbackCount: number }) {
  const env = health?.env;
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone={env?.openaiConfigured ? "emerald" : "amber"}>OpenAI {env?.openaiConfigured ? "on" : "fallback"}</Badge>
      <Badge tone={env?.tavilyConfigured ? "emerald" : "amber"}>Tavily {env?.tavilyConfigured ? "on" : "fallback"}</Badge>
      <Badge tone={env?.semanticScholarConfigured ? "emerald" : "amber"}>Semantic Scholar {env?.semanticScholarConfigured ? "keyed" : "public/fallback"}</Badge>
      <Badge tone={health?.feedbackStore.readable ? "emerald" : "red"}>Feedback {feedbackCount}</Badge>
      <Badge tone={env?.demoFallbackEnabled ? "blue" : "slate"}>Demo fallback {env?.demoFallbackEnabled ? "on" : "off"}</Badge>
    </div>
  );
}

function LiteratureCard({ qc, onGenerate, loading }: { qc: LiteratureQC; onGenerate: () => void; loading: boolean }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
            <BookOpen className="h-5 w-5 text-blue-600" /> Stage B — Literature QC
          </h2>
          <p className="mt-1 text-sm text-slate-600">Rapid novelty signal, not a systematic review.</p>
        </div>
        <Badge tone={qc.novelty.signal === "exact_match_found" ? "red" : qc.novelty.signal === "similar_work_exists" ? "amber" : "emerald"}>
          {qc.novelty.signal.replaceAll("_", " ")}
        </Badge>
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
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MiniField label="Domain" value={qc.parsed_hypothesis.domain} />
        <MiniField label="Experiment Type" value={qc.parsed_hypothesis.experiment_type} />
        <MiniField label="System" value={qc.parsed_hypothesis.organism_or_system} />
        <MiniField label="Outcome" value={qc.parsed_hypothesis.primary_outcome} />
      </div>
      <div className="mt-4">
        <h3 className="font-semibold text-slate-900">References</h3>
        <div className="mt-2 space-y-2">
          {qc.novelty.references.length === 0 ? (
            <p className="text-sm text-slate-500">No references retrieved.</p>
          ) : (
            qc.novelty.references.map((ref) => (
              <div key={ref.id} className="rounded-xl border bg-slate-50 p-3 text-sm">
                <div className="font-medium text-slate-900">{ref.title}</div>
                <div className="mt-1 text-slate-500">{ref.source} · {ref.year || "year unknown"} · {ref.relevance_reason}</div>
              </div>
            ))
          )}
        </div>
      </div>
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
  savedSincePlan,
  onRegenerate,
  onEdit
}: {
  plan: ExperimentPlan;
  savedSincePlan: boolean;
  onRegenerate: () => void;
  onEdit: (target: FeedbackTarget) => void;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950">
              <Beaker className="h-5 w-5 text-blue-600" /> Stage C — Plan Dashboard
            </h2>
            <p className="mt-1 text-sm text-slate-500">Plan ID: {plan.plan_id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                downloadText(
                  `${plan.plan_id}.json`,
                  JSON.stringify(plan, null, 2),
                  "application/json"
                )
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Export JSON
            </button>
            <button
              onClick={() =>
                downloadText(`${plan.plan_id}.md`, planToMarkdown(plan), "text/markdown")
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
        <p className="mt-4 text-sm leading-6 text-slate-700">{plan.executive_summary.experimental_strategy}</p>
      </Card>

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
              {plan.materials.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-3 font-medium text-slate-900">{m.name}<div className="font-normal text-slate-500">{m.purpose}</div></td>
                  <td>{m.supplier}</td>
                  <td>{m.catalog_number === "not_found" ? <Badge tone="amber">not found</Badge> : m.catalog_number}</td>
                  <td>{m.estimated_cost === null ? "—" : `$${m.estimated_cost}`}</td>
                  <td><Badge tone={m.confidence === "high" ? "emerald" : m.confidence === "medium" ? "blue" : "amber"}>{m.confidence}</Badge></td>
                  <td><EditButton onClick={() => onEdit(contextTarget("material", m.id, m))} compact /></td>
                </tr>
              ))}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-950">Scientist correction</h2>
        <p className="mt-1 text-sm text-slate-600">
          Turn expert review into reusable guidance for future similar plans.
        </p>
        <div className="mt-4 rounded-xl border bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">{target.label}</div>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {target.original_context}
          </pre>
        </div>
        <label className="mt-4 block text-sm font-medium text-slate-700">Corrected text</label>
        <textarea className="mt-1 w-full rounded-xl border p-3 text-sm" rows={4} value={correction} onChange={(e) => setCorrection(e.target.value)} />
        <label className="mt-4 block text-sm font-medium text-slate-700">Reason</label>
        <textarea className="mt-1 w-full rounded-xl border p-3 text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
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

function LoadingCard({ label }: { label: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3 text-slate-600">
        <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
        <span>{label}</span>
      </div>
      <div className="mt-4 space-y-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
      </div>
    </Card>
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
  if (text.trim().length < 20) return { ok: false, message: "Minimum 20 characters." };
  if (text.length > 3000) return { ok: false, message: "Maximum 3000 characters." };
  if (!/(will|would|can|detect|increase|reduce|outperform|measure|test|compare|effect)/i.test(text)) {
    return { ok: false, message: "Please phrase this as a testable scientific hypothesis or question." };
  }
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

function planToMarkdown(plan: ExperimentPlan): string {
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
  lines.push(`- Literature coverage: ${plan.evidence_quality.literature_coverage}`);
  lines.push(`- Supplier confidence: ${plan.evidence_quality.supplier_data_confidence}`);
  lines.push(`- Protocol grounding: ${plan.evidence_quality.protocol_grounding_confidence}`);
  lines.push(`- Overall confidence: ${plan.evidence_quality.overall_plan_confidence}`);
  lines.push("");
  lines.push(`Known gaps:`);
  for (const gap of plan.evidence_quality.known_gaps) {
    lines.push(`- ${gap}`);
  }
  lines.push("");
  lines.push("> Generated for expert review. Do not execute without approved local SOPs and required institutional approvals.");
  return lines.join("\n");
}
