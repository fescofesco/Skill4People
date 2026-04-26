import { chatCompletionsJson, getOpenAIClient, getOpenAIModel } from "./openai";
import { ExperimentPlan, LiteratureQC } from "./schemas";
import { getEnv } from "./env";

export type CritiqueFinding = {
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

export type PlanCritique = {
  source: "openai" | "heuristic";
  model: string | null;
  overall_assessment: "weak" | "needs_work" | "solid";
  findings: CritiqueFinding[];
  errors: string[];
};

const CRITIC_SYSTEM = `You are a senior experimental scientist reviewing an AI-generated experiment plan for a colleague. Your job is to find concrete weaknesses a domain expert would flag, NOT to rewrite the plan.

Return strict JSON with this exact shape:
{
  "overall_assessment": "weak" | "needs_work" | "solid",
  "findings": [
    {
      "area": "controls" | "statistics" | "sample_size" | "validation" | "safety" | "feasibility" | "evidence" | "scope",
      "finding": "<one-sentence concrete weakness>",
      "suggestion": "<one-sentence specific fix>",
      "severity": "info" | "warning" | "critical"
    }
  ]
}

Rules:
- Maximum 6 findings, ordered by severity (critical first).
- Be SPECIFIC. Refer to material names, control names, or numeric targets that appear in the plan.
- Do not repeat the plan back. Do not invent missing details.
- If the plan is solid, return at most 2 findings of severity "info".`;

function buildCriticUserPrompt(plan: ExperimentPlan, lit: LiteratureQC): string {
  const validation = plan.validation;
  const summary = {
    hypothesis: plan.hypothesis?.raw,
    parsed: lit.parsed_hypothesis,
    objective: plan.executive_summary?.objective,
    decision_gate: plan.executive_summary?.decision_gate,
    materials: (plan.materials || []).map((m) => ({
      name: m.name,
      supplier: m.supplier,
      catalog_number: m.catalog_number,
      unit_cost: m.unit_cost,
      confidence: m.confidence
    })),
    controls: (validation?.controls || []).map((c) => ({
      name: c.name,
      type: c.control_type,
      purpose: c.purpose
    })),
    validation: validation
      ? {
          primary_readout: validation.primary_readout,
          secondary_readouts: validation.secondary_readouts,
          sample_size_rationale: validation.sample_size_rationale,
          replicate_strategy: validation.replicate_strategy,
          statistical_analysis: validation.statistical_analysis,
          success_criteria: validation.success_criteria,
          failure_criteria: validation.failure_criteria,
          data_quality_checks: validation.data_quality_checks
        }
      : null,
    risks: (plan.risks_and_mitigations || []).map((r) => ({
      risk: r.risk,
      severity: r.severity
    })),
    novelty_signal: lit.novelty.signal,
    reference_count: lit.novelty.references.length,
    budget_total: plan.budget?.estimated_total,
    materials_priced: (plan.materials || []).filter((m) => m.unit_cost !== null).length,
    safety_flags: lit.parsed_hypothesis.safety_flags
  };
  return [
    "Critique this plan as a senior experimental scientist would. Be concrete and specific.",
    "PLAN SUMMARY:",
    JSON.stringify(summary, null, 2)
  ].join("\n");
}

/**
 * Heuristic critique used when OpenAI is unavailable or 429s. Pattern-matches
 * common gaps a reviewer would always flag.
 */
export function heuristicCritique(plan: ExperimentPlan, lit: LiteratureQC): PlanCritique {
  const findings: CritiqueFinding[] = [];

  const materials = plan.materials || [];
  const priced = materials.filter((m) => m.unit_cost !== null).length;
  if (materials.length > 0 && priced === 0) {
    findings.push({
      area: "evidence",
      finding: "No material has a verified unit cost; the budget is a placeholder.",
      suggestion:
        "Add specific catalog numbers and prices via supplier evidence (Tavily) or quotes before ordering.",
      severity: "critical"
    });
  } else if (materials.length > 0 && priced < materials.length / 2) {
    findings.push({
      area: "evidence",
      finding: `Only ${priced}/${materials.length} materials have verified prices.`,
      suggestion:
        "Refine intervention/system terms so supplier search resolves the remaining items, or add manual quotes.",
      severity: "warning"
    });
  }

  const controls = plan.validation?.controls || [];
  const controlTypes = new Set(controls.map((c) => c.control_type));
  if (!controlTypes.has("negative")) {
    findings.push({
      area: "controls",
      finding: "No explicit negative control listed.",
      suggestion:
        "Add a sham/no-intervention or matrix-only control so off-target signal can be measured.",
      severity: "warning"
    });
  }
  if (!controlTypes.has("positive")) {
    findings.push({
      area: "controls",
      finding: "No positive/reference control listed.",
      suggestion:
        "Add a known positive (or reference standard) so the readout is calibrated against expected response.",
      severity: "info"
    });
  }

  const validation = plan.validation;
  const hasSampleSize =
    typeof validation?.sample_size_rationale === "string" &&
    validation.sample_size_rationale.trim().length > 0;
  if (!hasSampleSize) {
    findings.push({
      area: "sample_size",
      finding: "Sample-size rationale is not stated.",
      suggestion:
        "Justify n with a power calculation tied to the expected effect size in the parsed hypothesis.",
      severity: "warning"
    });
  }
  const hasStats =
    typeof validation?.statistical_analysis === "string" &&
    validation.statistical_analysis.trim().length > 0;
  if (!hasStats) {
    findings.push({
      area: "statistics",
      finding: "Statistical analysis plan is missing.",
      suggestion:
        "Pre-specify primary test, multiplicity correction, and decision rule for the success threshold.",
      severity: "warning"
    });
  }

  const refCount = lit.novelty?.references?.length ?? 0;
  if (refCount < 3) {
    findings.push({
      area: "evidence",
      finding: `Literature coverage is thin (${refCount} reference${refCount === 1 ? "" : "s"}).`,
      suggestion:
        "Run a deeper search or add domain-specific keywords; novelty assessment is fragile under <3 hits.",
      severity: refCount === 0 ? "critical" : "info"
    });
  }

  const safetyFlags = lit.parsed_hypothesis.safety_flags || [];
  const safetyText = (plan.safety_ethics_compliance?.required_approvals || []).join(" ").toLowerCase();
  if (safetyFlags.length > 0 && safetyText.length === 0) {
    findings.push({
      area: "safety",
      finding: "Hypothesis triggered safety flags but the plan does not list required approvals.",
      suggestion:
        "Add IRB / IACUC / IBC review steps explicitly to the safety_ethics_compliance.required_approvals.",
      severity: "critical"
    });
  }

  const overall: PlanCritique["overall_assessment"] = findings.some((f) => f.severity === "critical")
    ? "weak"
    : findings.some((f) => f.severity === "warning")
      ? "needs_work"
      : "solid";

  return {
    source: "heuristic",
    model: null,
    overall_assessment: overall,
    findings: findings.slice(0, 6),
    errors: []
  };
}

/**
 * AI-first plan critique. Tries OpenAI, falls back to a deterministic
 * heuristic on any error. Always returns a structurally valid critique.
 */
export async function critiquePlan(
  plan: ExperimentPlan,
  literatureQC: LiteratureQC
): Promise<PlanCritique> {
  const env = getEnv();
  if (!env.openaiApiKey || !getOpenAIClient()) {
    return heuristicCritique(plan, literatureQC);
  }
  const errors: string[] = [];
  try {
    const raw = await chatCompletionsJson({
      system: CRITIC_SYSTEM,
      user: buildCriticUserPrompt(plan, literatureQC),
      temperature: 0.2,
      maxTokens: 800
    });
    const parsed = raw as Partial<PlanCritique> & { findings?: CritiqueFinding[] };
    if (!parsed || typeof parsed !== "object") throw new Error("non_object_critique");
    const findings = Array.isArray(parsed.findings) ? parsed.findings.slice(0, 6) : [];
    const overall = (parsed.overall_assessment as PlanCritique["overall_assessment"]) || "needs_work";
    return {
      source: "openai",
      model: getOpenAIModel(),
      overall_assessment: ["weak", "needs_work", "solid"].includes(overall) ? overall : "needs_work",
      findings,
      errors
    };
  } catch (err) {
    errors.push(
      "openai_critic_request_failed: " +
        (err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240))
    );
    const fallback = heuristicCritique(plan, literatureQC);
    return { ...fallback, errors: [...fallback.errors, ...errors] };
  }
}
