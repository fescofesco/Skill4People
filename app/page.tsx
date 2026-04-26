"use client";

import { type FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Beaker,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  DollarSign,
  ExternalLink,
  FlaskConical,
  Layers3,
  Loader2,
  PencilLine,
  Microscope,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type NoveltySignal = "not found" | "similar work exists" | "exact match found";

type Reference = {
  title: string;
  url: string;
  summary: string;
};

type LiteratureQcResponse = {
  noveltySignal: NoveltySignal;
  references: Reference[];
};

type ProtocolStep = {
  step?: number;
  title?: string;
  methodology?: string;
  rationale?: string;
};

type MaterialItem = {
  item?: string;
  supplier?: string;
  catalogNumber?: string;
  purpose?: string;
};

type BudgetLine = {
  lineItem?: string;
  estimatedCost?: string;
  notes?: string;
};

type TimelinePhase = {
  phase?: string;
  duration?: string;
  dependencies?: string[];
  deliverable?: string;
};

type ValidationMeasure = {
  measure?: string;
  successCriteria?: string;
  failureMode?: string;
};

type PriorLearning = {
  originalQuery?: string;
  correction?: string;
};

type ExperimentPlan = {
  priorLearnings?: PriorLearning[];
  protocol?: ProtocolStep[];
  materials?: MaterialItem[];
  budget?: BudgetLine[];
  timeline?: TimelinePhase[];
  validation?: ValidationMeasure[];
};

type ExperimentPlanKey =
  | "protocol"
  | "materials"
  | "budget"
  | "timeline"
  | "validation";
type CorrectableSection = "protocol" | "materials" | "budget";

type PlanDisplayItem = {
  content: string;
  oldValue: unknown;
  correctable: boolean;
};

type CorrectionTarget = {
  section: CorrectableSection;
  displayValue: string;
  oldValue: unknown;
};

const qcStates: Record<
  NoveltySignal,
  {
    badge: "success" | "warning" | "destructive";
    summary: string;
    confidence: string;
  }
> = {
  "not found": {
    badge: "success",
    summary: "No direct precedent found across the current reference set.",
    confidence: "High novelty confidence",
  },
  "similar work exists": {
    badge: "warning",
    summary:
      "Related approaches exist, but the proposed mechanism and validation route appear distinct.",
    confidence: "Moderate novelty confidence",
  },
  "exact match found": {
    badge: "destructive",
    summary:
      "A close methodological match was detected. Reframe the question before planning.",
    confidence: "Low novelty confidence",
  },
};

const defaultReferences: Reference[] = [
  {
    title: "Adaptive hydrogel matrices for skeletal muscle organoid maturation",
    url: "https://www.nature.com/",
    summary:
      "Reports matrix-tuning effects on contractile maturation but does not test closed-loop stimulation.",
  },
  {
    title: "Electrical pacing protocols improve myotube alignment in vitro",
    url: "https://pubmed.ncbi.nlm.nih.gov/",
    summary:
      "Useful baseline for pulse-width and frequency selection during protocol design.",
  },
  {
    title: "Protocol for human iPSC-derived skeletal muscle microtissues",
    url: "https://www.protocols.io/",
    summary:
      "Materials and media schedule can seed the first experimental bill of materials.",
  },
];

const defaultExperimentPlan: ExperimentPlan = {
  protocol: [
    {
      step: 1,
      title: "Differentiate and seed microtissues",
      methodology:
        "Differentiate iPSCs into skeletal muscle progenitors and seed into tunable hydrogel molds.",
      rationale:
        "Creates aligned, contractile tissue units suitable for stimulation and force readouts.",
    },
    {
      step: 2,
      title: "Acclimate constructs",
      methodology: "Apply a 7-day acclimation period with media changes every 48 hours.",
      rationale: "Stabilizes viability and baseline morphology before intervention.",
    },
    {
      step: 3,
      title: "Apply stimulation",
      methodology:
        "Introduce closed-loop electrical stimulation from day 8 using force-output feedback.",
      rationale:
        "Tests whether adaptive pacing improves maturation versus fixed-frequency pacing.",
    },
    {
      step: 4,
      title: "Quantify maturation",
      methodology:
        "Measure myosin heavy-chain staining, twitch force, and calcium flux at endpoint.",
      rationale:
        "Combines molecular and functional endpoints for maturation assessment.",
    },
  ],
  materials: [
    {
      item: "Human iPSC-derived myogenic progenitors",
      supplier: "FUJIFILM Cellular Dynamics",
      catalogNumber: "R1058",
      purpose: "Representative cell source for skeletal muscle microtissue generation.",
    },
    {
      item: "Growth factor-reduced basement membrane matrix",
      supplier: "Corning",
      catalogNumber: "356231",
      purpose: "Hydrogel component for three-dimensional tissue support.",
    },
    {
      item: "Anti-myosin heavy chain antibody",
      supplier: "Developmental Studies Hybridoma Bank",
      catalogNumber: "MF20",
      purpose: "Endpoint staining marker for myogenic maturation.",
    },
  ],
  budget: [
    {
      lineItem: "Cells and culture reagents",
      estimatedCost: "£1,250",
      notes: "Pilot-scale procurement for two conditions with triplicate wells.",
    },
    {
      lineItem: "Hydrogel and consumables",
      estimatedCost: "£620",
      notes: "Molds, matrix reagents, pipette tips, plates, and staining consumables.",
    },
    {
      lineItem: "Imaging and analysis",
      estimatedCost: "£780",
      notes: "Microscope access, staining reagents, and image quantification time.",
    },
  ],
  timeline: [
    {
      phase: "Cell expansion and setup",
      duration: "Week 1",
      dependencies: ["Cell vial availability", "Hydrogel mold preparation"],
      deliverable: "Seeded constructs ready for differentiation.",
    },
    {
      phase: "Differentiation and calibration",
      duration: "Week 2",
      dependencies: ["Stable viability", "Baseline imaging"],
      deliverable: "Calibrated stimulation parameters.",
    },
    {
      phase: "Intervention and readouts",
      duration: "Weeks 3-4",
      dependencies: ["Functional stimulation hardware", "Predefined endpoints"],
      deliverable: "Endpoint staining, force traces, and calcium-flux data.",
    },
  ],
  validation: [
    {
      measure: "Twitch force",
      successCriteria: "At least 20% improvement over fixed-frequency control.",
      failureMode: "No functional gain or reduced viability after stimulation.",
    },
    {
      measure: "Maturation marker intensity",
      successCriteria: "Higher normalized myosin heavy-chain signal versus control.",
      failureMode: "No marker increase or inconsistent staining across replicates.",
    },
    {
      measure: "Cell viability",
      successCriteria: "Viability remains within acceptable pilot-study limits.",
      failureMode: "Stimulation causes unacceptable loss of viable tissue.",
    },
  ],
};

const emptyExperimentPlan: ExperimentPlan = {
  priorLearnings: [],
  protocol: [],
  materials: [],
  budget: [],
  timeline: [],
  validation: [],
};

const planSectionMeta: Record<
  ExperimentPlanKey,
  {
    label: string;
    icon: typeof ClipboardList;
    title: string;
    description: string;
  }
> = {
  protocol: {
    label: "Protocol",
    icon: ClipboardList,
    title: "Step-by-step methodology",
    description:
      "A staged workflow grounded in the scientific question and Literature QC context.",
  },
  materials: {
    label: "Materials",
    icon: Beaker,
    title: "Reagents and suppliers",
    description:
      "Specific materials with representative suppliers, catalog numbers, and purpose.",
  },
  budget: {
    label: "Budget",
    icon: DollarSign,
    title: "Cost estimate",
    description: "Line-item costs with currency and assumptions for the pilot study.",
  },
  timeline: {
    label: "Timeline",
    icon: CalendarDays,
    title: "Phased execution",
    description: "A dependency-aware schedule with deliverables at each phase.",
  },
  validation: {
    label: "Validation",
    icon: ShieldCheck,
    title: "Success and failure measures",
    description:
      "Decision criteria that make the plan auditable and scientifically useful.",
  },
};

function getReferenceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Reference";
  }
}

function buildPlanSections(plan: ExperimentPlan) {
  const fallback = "Streaming plan details...";

  return [
    {
      value: "protocol" as const,
      ...planSectionMeta.protocol,
      items:
        plan.protocol?.map((step, index) => ({
          content: [
            `${step.step ?? index + 1}. ${step.title ?? "Protocol step"}`,
            step.methodology,
            step.rationale ? `Rationale: ${step.rationale}` : undefined,
          ]
            .filter(Boolean)
            .join(" - "),
          oldValue: step,
          correctable: true,
        })) ?? [],
    },
    {
      value: "materials" as const,
      ...planSectionMeta.materials,
      items:
        plan.materials?.map((material) => ({
          content: [
            material.item ?? "Material",
            material.supplier ? `Supplier: ${material.supplier}` : undefined,
            material.catalogNumber ? `Catalog: ${material.catalogNumber}` : undefined,
            material.purpose,
          ]
            .filter(Boolean)
            .join(" - "),
          oldValue: material,
          correctable: true,
        })) ?? [],
    },
    {
      value: "budget" as const,
      ...planSectionMeta.budget,
      items:
        plan.budget?.map((line) => ({
          content: [
            line.lineItem ?? "Budget line",
            line.estimatedCost,
            line.notes,
          ]
            .filter(Boolean)
            .join(" - "),
          oldValue: line,
          correctable: true,
        })) ?? [],
    },
    {
      value: "timeline" as const,
      ...planSectionMeta.timeline,
      items:
        plan.timeline?.map((phase) => ({
          content: [
            phase.phase ?? "Timeline phase",
            phase.duration,
            phase.dependencies?.length
              ? `Depends on: ${phase.dependencies.join(", ")}`
              : undefined,
            phase.deliverable ? `Deliverable: ${phase.deliverable}` : undefined,
          ]
            .filter(Boolean)
            .join(" - "),
          oldValue: phase,
          correctable: false,
        })) ?? [],
    },
    {
      value: "validation" as const,
      ...planSectionMeta.validation,
      items:
        plan.validation?.map((measure) => ({
          content: [
            measure.measure ?? "Validation measure",
            measure.successCriteria
              ? `Success: ${measure.successCriteria}`
              : undefined,
            measure.failureMode ? `Failure: ${measure.failureMode}` : undefined,
          ]
            .filter(Boolean)
            .join(" - "),
          oldValue: measure,
          correctable: false,
        })) ?? [],
    },
  ].map((section) => ({
    ...section,
    items: section.items.length
      ? section.items
      : [{ content: fallback, oldValue: fallback, correctable: false }],
  }));
}

export default function Home() {
  const [question, setQuestion] = useState(
    "Can closed-loop electrical stimulation improve maturation of human iPSC-derived skeletal muscle organoids compared with fixed-frequency pacing?",
  );
  const [noveltySignal, setNoveltySignal] =
    useState<NoveltySignal>("similar work exists");
  const [references, setReferences] = useState<Reference[]>(defaultReferences);
  const [experimentPlan, setExperimentPlan] =
    useState<ExperimentPlan>(defaultExperimentPlan);
  const [latestLiteratureQc, setLatestLiteratureQc] =
    useState<LiteratureQcResponse>({
      noveltySignal: "similar work exists",
      references: defaultReferences,
    });
  const [isCheckingLiterature, setIsCheckingLiterature] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isSavingExperiment, setIsSavingExperiment] = useState(false);
  const [qcError, setQcError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [correctionTarget, setCorrectionTarget] =
    useState<CorrectionTarget | null>(null);
  const [correctedValue, setCorrectedValue] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const qcState = qcStates[noveltySignal];
  const planSections = useMemo(
    () => buildPlanSections(experimentPlan),
    [experimentPlan],
  );
  const hasGeneratedPlan = Boolean(
    experimentPlan.protocol?.length ||
      experimentPlan.materials?.length ||
      experimentPlan.budget?.length,
  );
  const workflowStats = [
    {
      label: "QC status",
      value: isCheckingLiterature ? "Checking" : qcError ? "Needs retry" : "Complete",
    },
    { label: "References", value: `${references.length} screened` },
    {
      label: "Plan status",
      value: isGeneratingPlan ? "Streaming" : planError ? "Needs retry" : "Draft ready",
    },
  ];

  async function saveExperimentRecord(
    plan: ExperimentPlan,
    literatureQc: LiteratureQcResponse,
  ) {
    setIsSavingExperiment(true);

    try {
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          original_query: question,
          domain: "biomedical research",
          generated_plan: plan,
          literature_qc: literatureQc,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;

      if (!response.ok || !payload?.id) {
        throw new Error(
          payload?.error ?? "Experiment saved locally but not to Supabase.",
        );
      }

      setExperimentId(payload.id);
      setPlanError(null);
    } finally {
      setIsSavingExperiment(false);
    }
  }

  async function handleSaveCurrentExperiment() {
    try {
      await saveExperimentRecord(experimentPlan, latestLiteratureQc);
    } catch (error) {
      setPlanError(
        error instanceof Error ? error.message : "Failed to save experiment.",
      );
    }
  }

  async function handleFeedbackSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!correctionTarget || !experimentId) {
      setFeedbackStatus("Save the generated experiment before submitting feedback.");
      return;
    }

    setIsSubmittingFeedback(true);
    setFeedbackStatus(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          experiment_id: experimentId,
          section: correctionTarget.section,
          old_value: correctionTarget.oldValue,
          corrected_value: correctedValue,
          explanation: correctionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to save feedback.");
      }

      setFeedbackStatus("Correction saved to Supabase.");
      setCorrectionTarget(null);
      setCorrectedValue("");
      setCorrectionReason("");
    } catch (error) {
      setFeedbackStatus(
        error instanceof Error ? error.message : "Failed to save feedback.",
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  function openCorrectionDialog(
    section: CorrectableSection,
    item: PlanDisplayItem,
  ) {
    setCorrectionTarget({
      section,
      displayValue: item.content,
      oldValue: item.oldValue,
    });
    setCorrectedValue(item.content);
    setCorrectionReason("");
    setFeedbackStatus(null);
  }

  async function streamExperimentPlan(literatureQc: LiteratureQcResponse) {
    setIsGeneratingPlan(true);
    setPlanError(null);
    setExperimentPlan(emptyExperimentPlan);
    setExperimentId(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 240_000);

    try {
      const response = await fetch("/api/generate-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          question,
          literatureQc,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Experiment plan generation failed.");
      }

      if (!response.body) {
        throw new Error("Experiment plan stream was empty.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let latestPlan: ExperimentPlan = emptyExperimentPlan;

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          const partialPlan = JSON.parse(line) as ExperimentPlan | { error?: string };

          if ("error" in partialPlan && partialPlan.error) {
            throw new Error(partialPlan.error);
          }

          setExperimentPlan(partialPlan as ExperimentPlan);
          latestPlan = partialPlan as ExperimentPlan;
        }
      }

      if (buffer.trim()) {
        const finalPlan = JSON.parse(buffer) as ExperimentPlan | { error?: string };

        if ("error" in finalPlan && finalPlan.error) {
          throw new Error(finalPlan.error);
        }

        setExperimentPlan(finalPlan as ExperimentPlan);
        latestPlan = finalPlan as ExperimentPlan;
      }

      await saveExperimentRecord(latestPlan, literatureQc);
    } catch (error) {
      setPlanError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Experiment plan generation timed out. Check the dev-server logs for the Google provider error."
          : error instanceof Error
          ? error.message
          : "Experiment plan generation failed. Please try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsGeneratingPlan(false);
    }
  }

  async function handleLiteratureQc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!question.trim()) {
      setQcError("Enter a scientific question before running Literature QC.");
      return;
    }

    setIsCheckingLiterature(true);
    setQcError(null);
    setPlanError(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 240_000);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({ question }),
      });
      const payload = (await response.json()) as
        | LiteratureQcResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Literature QC failed.",
        );
      }

      const result = payload as LiteratureQcResponse;
      setNoveltySignal(result.noveltySignal);
      setReferences(result.references);
      setLatestLiteratureQc(result);
      setIsCheckingLiterature(false);
      await streamExperimentPlan(result);
    } catch (error) {
      setQcError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Literature QC timed out. Check the dev-server logs to see whether Tavily or Google is hanging."
          : error instanceof Error
          ? error.message
          : "Literature QC failed. Please try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setIsCheckingLiterature(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(14,116,144,0.14),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef5f9_100%)]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-6 rounded-4xl border border-white/70 bg-white/80 p-6 shadow-soft backdrop-blur md:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
            <div className="max-w-3xl space-y-5">
              <Badge variant="secondary" className="w-fit gap-2 px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-cyan-600" />
                AI-assisted scientific planning workspace
              </Badge>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  The AI Scientist
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600">
                  Turn a natural language research question into a screened,
                  defensible experiment plan with literature awareness and
                  transparent assumptions.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              {workflowStats.map((stat) => (
                <Card key={stat.label} className="border-slate-200/80 bg-white/75">
                  <CardContent className="p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">
                      {stat.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="border-slate-200/80 bg-white/90 shadow-soft">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                  <Microscope className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-xl">Scientific question</CardTitle>
                  <CardDescription>
                    Start with the claim, mechanism, population, and measurable
                    outcome you want to test.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleLiteratureQc}>
                <Textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  className="min-h-[220px] resize-none border-slate-200 bg-white text-base leading-7 shadow-inner"
                  placeholder="Ask a natural language scientific question..."
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Hypothesis-ready</Badge>
                    <Badge variant="outline">Wet-lab context</Badge>
                    <Badge variant="outline">Tavily QC</Badge>
                  </div>
                  <Button
                    className="gap-2"
                    disabled={
                      isCheckingLiterature ||
                      isGeneratingPlan ||
                      question.trim().length < 10
                    }
                    type="submit"
                  >
                    {isCheckingLiterature || isGeneratingPlan ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {isCheckingLiterature
                          ? "Checking literature"
                          : "Streaming plan"}
                      </>
                    ) : (
                      <>
                        Run Literature QC
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/90 shadow-soft">
            <CardHeader>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                    <BookOpenCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Literature QC</CardTitle>
                    <CardDescription>
                      Novelty screening state and supporting references.
                    </CardDescription>
                  </div>
                </div>
                <Badge variant={qcState.badge} className="w-fit capitalize">
                  {noveltySignal}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  {qcError ? (
                    <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-cyan-700" />
                  )}
                  <div>
                    <p className="font-medium text-slate-950">
                      {qcError ?? qcState.summary}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {isCheckingLiterature
                        ? "Searching academic and protocol sources..."
                        : qcError
                          ? "Check your API configuration or retry the request."
                          : qcState.confidence}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                {references.map((reference) => (
                  <article
                    key={reference.title}
                    className="rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-cyan-200"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold leading-6 text-slate-950">
                          {reference.title}
                        </h3>
                        <a
                          className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-cyan-700 hover:text-cyan-900"
                          href={reference.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {getReferenceHost(reference.url)}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <Badge variant="secondary" className="w-fit">
                        Reference
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {reference.summary}
                    </p>
                  </article>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 bg-white/90 shadow-soft">
          <CardHeader>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-slate-900 p-3 text-white">
                  <FlaskConical className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Experiment Plan</CardTitle>
                  <CardDescription>
                    A structured draft ready for protocol review, procurement,
                    and validation planning.
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="w-fit gap-2 px-3 py-1">
                {isGeneratingPlan ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Layers3 className="h-3.5 w-3.5" />
                )}
                {isGeneratingPlan ? "Streaming plan" : "Five planning layers"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {planError ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
                <span>{planError}</span>
                {hasGeneratedPlan && !experimentId ? (
                  <Button
                    className="w-fit shrink-0"
                    disabled={isSavingExperiment}
                    onClick={handleSaveCurrentExperiment}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {isSavingExperiment ? "Saving..." : "Retry Supabase save"}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {feedbackStatus ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {feedbackStatus}
              </div>
            ) : null}
            {experimentPlan.priorLearnings?.length ? (
              <Collapsible defaultOpen={false} className="group">
                <div className="overflow-hidden rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-blue-50 shadow-sm">
                  <CollapsibleTrigger asChild>
                    <button
                      className="flex w-full flex-col gap-4 p-5 text-left transition-colors hover:bg-white/45 sm:flex-row sm:items-center sm:justify-between"
                      type="button"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-200">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-950">
                              Applied {experimentPlan.priorLearnings.length}{" "}
                              learnings from past experiments
                            </h3>
                            <Badge
                              variant="secondary"
                              className="bg-indigo-100 text-indigo-700"
                            >
                              AI Learning
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            Retrieved scientist feedback was used as prior
                            context for this generated plan.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                        <span>View context</span>
                        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-indigo-100/80 bg-white/55 p-5">
                      <div className="grid gap-3">
                        {experimentPlan.priorLearnings.map((learning, index) => (
                          <article
                            key={`${learning.originalQuery}-${index}`}
                            className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className="border-indigo-200 text-indigo-700"
                              >
                                Learning {index + 1}
                              </Badge>
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                Past experiment
                              </p>
                            </div>
                            <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">
                              {learning.originalQuery}
                            </p>
                            <div className="mt-4 rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-medium uppercase tracking-[0.18em] text-indigo-700">
                                Applied correction
                              </p>
                              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                                {learning.correction}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ) : null}
            <Tabs defaultValue="protocol" className="space-y-6">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-slate-100 p-1 sm:grid-cols-3 lg:grid-cols-5">
                {planSections.map((section) => {
                  const Icon = section.icon;

                  return (
                    <TabsTrigger
                      key={section.value}
                      value={section.value}
                      className="gap-2 py-2.5"
                    >
                      <Icon className="h-4 w-4" />
                      {section.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {planSections.map((section) => {
                const Icon = section.icon;

                return (
                  <TabsContent key={section.value} value={section.value}>
                    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
                      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
                          <Icon className="h-6 w-6" />
                        </div>
                        <h3 className="text-2xl font-semibold tracking-tight text-slate-950">
                          {section.title}
                        </h3>
                        <p className="mt-3 leading-7 text-slate-600">
                          {section.description}
                        </p>
                      </div>

                      <div className="grid gap-3">
                        {section.items.map((item, index) => (
                          <div
                            key={`${section.value}-${index}-${item.content}`}
                            className={cn(
                              "flex gap-4 rounded-2xl border border-slate-200 bg-white p-4",
                              index === 0 && "border-cyan-200 bg-cyan-50/50",
                            )}
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                              {index + 1}
                            </div>
                            <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <p className="leading-7 text-slate-700">
                                {item.content}
                              </p>
                              {item.correctable &&
                              (section.value === "protocol" ||
                                section.value === "materials" ||
                                section.value === "budget") ? (
                                <Button
                                  className="w-fit shrink-0 gap-2"
                                  disabled={
                                    !experimentId ||
                                    isGeneratingPlan ||
                                    isSavingExperiment
                                  }
                                  onClick={() =>
                                    openCorrectionDialog(section.value, item)
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <PencilLine className="h-3.5 w-3.5" />
                                  Suggest Correction
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </CardContent>
        </Card>

        <Dialog
          open={Boolean(correctionTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setCorrectionTarget(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <DialogTitle>Suggest Correction</DialogTitle>
                  <DialogDescription>
                    Replace the item with a clearer scientist-reviewed version
                    and briefly explain why.
                  </DialogDescription>
                </div>
                {correctionTarget ? (
                  <Badge variant="secondary" className="w-fit capitalize">
                    {correctionTarget.section}
                  </Badge>
                ) : null}
              </div>
            </DialogHeader>
            <form className="space-y-5" onSubmit={handleFeedbackSubmit}>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="original-value"
                >
                  Original item
                </label>
                <div
                  id="original-value"
                  className="max-h-40 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"
                >
                  {correctionTarget?.displayValue}
                </div>
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="corrected-value"
                >
                  Corrected item
                </label>
                <Textarea
                  id="corrected-value"
                  value={correctedValue}
                  onChange={(event) => setCorrectedValue(event.target.value)}
                  placeholder="Rewrite the item as it should appear in the plan"
                  className="min-h-[120px] resize-y text-sm leading-6"
                />
                <p className="text-xs text-slate-500">
                  Edit the full item text, not the database JSON. Keep catalog
                  numbers, costs, and assumptions explicit where relevant.
                </p>
              </div>
              <div className="space-y-2">
                <label
                  className="text-sm font-medium text-slate-700"
                  htmlFor="correction-reason"
                >
                  Reason for correction
                </label>
                <Textarea
                  id="correction-reason"
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder="Example: supplier catalog number is outdated, cost estimate is too low, or the protocol step is scientifically incomplete."
                  className="min-h-[110px] resize-y text-sm leading-6"
                />
              </div>
              {feedbackStatus ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {feedbackStatus}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCorrectionTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    isSubmittingFeedback ||
                    !correctedValue.trim() ||
                    !correctionReason.trim()
                  }
                  type="submit"
                >
                  {isSubmittingFeedback ? "Saving..." : "Save Correction"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </section>
    </main>
  );
}
