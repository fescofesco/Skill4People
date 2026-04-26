import { z } from "zod";
import { chatCompletionsJson, getOpenAIClient } from "./openai";
import { truncate } from "./utils";

const ScopeEnum = z.enum(["organization", "category", "experiment"]);

const ClassifiedRuleSchema = z.object({
  scope: ScopeEnum,
  applicable_rule: z.string().min(1),
  derived_rule: z.string().min(1),
  normalized_tags: z.array(z.string()).default([]),
  suggested_applicability: z
    .enum(["only_this_plan", "similar_experiment_type", "broad_rule"])
    .optional()
});

export type ClassifiedFeedbackRule = z.infer<typeof ClassifiedRuleSchema>;

export type FeedbackClassificationInput = {
  original_context: string;
  correction: string;
  reason: string;
  item_type: string;
  domain: string;
  experiment_type: string;
  tags: string[];
  applicability: "only_this_plan" | "similar_experiment_type" | "broad_rule";
  severity: "minor" | "important" | "critical";
  organization_id?: string;
  category_id?: string | null;
  category_name?: string | null;
};

const SYSTEM_PROMPT = `You are the rule curator for an experiment-planning assistant.

You receive a scientist's correction of a generated experiment plan. You must do two things:

1. CLASSIFY the correction into exactly one of three scopes:
   - "organization": a lab-wide standard, safety policy, supplier preference, or general best practice that applies to MOST experiments regardless of subject.
     Examples: "Always use vendor X for solvents", "All work needs PI sign-off before ordering", "Use 2 mL Eppendorf tubes by default".
   - "category": applies to ALL experiments in the provided category (e.g. "colloidal synthesis", "chemical synthesis", "mechanical setup building"). The rule is more specific than an org-wide rule but generalizes beyond a single hypothesis.
     Examples (for colloidal synthesis): "Always confirm DLS PDI < 0.2 before assuming monodisperse", "Use freshly distilled solvents for nanoparticle synthesis".
   - "experiment": depends on the specific hypothesis (this exact organism, intervention, comparator, or readout). It does not generalize to other experiments in the same category.
     Examples: "For our Pd-Cu nanoparticle CO2 reduction work, prefer 4 hr reduction time", "When using HeLa for trehalose cryopreservation, authenticate by STR every 6 months".

2. REWRITE the correction into a single imperative sentence ("applicable_rule") that can be appended VERBATIM to a system prompt. It should be:
   - imperative (start with a verb: "Always include...", "Avoid...", "Use...", "Verify...")
   - self-contained (a planner reading it cold should know what to do)
   - free of vague references like "this experiment" or "the previous case" — name the condition instead

Also produce:
- "derived_rule": a one-to-three-sentence descriptive form of the rule, retaining context.
- "normalized_tags": short lowercase tags useful for retrieval.

If the correction is too vague to classify confidently, default to "experiment" (the safest, most narrow scope).

Return strict JSON: { "scope": "organization"|"category"|"experiment", "applicable_rule": string, "derived_rule": string, "normalized_tags": string[], "suggested_applicability": "only_this_plan"|"similar_experiment_type"|"broad_rule" }.`;

export async function classifyFeedbackRule(
  input: FeedbackClassificationInput
): Promise<ClassifiedFeedbackRule> {
  const client = getOpenAIClient();
  if (client) {
    try {
      const userPrompt = JSON.stringify(
        {
          item_type: input.item_type,
          domain: input.domain,
          experiment_type: input.experiment_type,
          organization_id: input.organization_id ?? null,
          category_id: input.category_id ?? null,
          category_name: input.category_name ?? null,
          original_context: truncate(input.original_context, 1200),
          correction: truncate(input.correction, 1200),
          reason: truncate(input.reason, 800),
          tags: input.tags,
          legacy_applicability_hint: input.applicability,
          severity: input.severity
        },
        null,
        2
      );
      const raw = await chatCompletionsJson({
        system: SYSTEM_PROMPT,
        user: `Scientist correction context:\n${userPrompt}\n\nProduce the JSON object described in the system prompt.`,
        temperature: 0.1
      });
      const parsed = ClassifiedRuleSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to heuristic
    }
  }
  return heuristicClassification(input);
}

/**
 * Backwards-compatible entry point. The old name is preserved so callers
 * that haven't been migrated yet still work; new callers should use
 * `classifyFeedbackRule`.
 */
export const deriveFeedbackRule = classifyFeedbackRule;

export function heuristicClassification(input: FeedbackClassificationInput): ClassifiedFeedbackRule {
  const shortOrig = truncate(input.original_context.replace(/\s+/g, " "), 140);
  const shortCorr = truncate(input.correction.replace(/\s+/g, " "), 200);
  const shortReason = truncate(input.reason.replace(/\s+/g, " "), 140);

  const corrLower = (shortCorr + " " + shortReason).toLowerCase();
  const orgKeywords = [
    "always",
    "never",
    "every experiment",
    "every plan",
    "lab-wide",
    "lab wide",
    "our lab",
    "our policy",
    "company-wide",
    "organization",
    "vendor",
    "supplier we use",
    "default supplier",
    "policy",
    "compliance",
    "safety policy",
    "ppe"
  ];
  const categoryKeywords = [
    "synthesis",
    "colloidal",
    "nanoparticle",
    "precursor",
    "solvent",
    "ligand",
    "calibration",
    "characterization",
    "rig",
    "assay",
    "cell culture",
    "buffer",
    "electrode",
    "potentiostat",
    "for this category",
    "all experiments of this type",
    "any experiment in"
  ];

  let scope: ClassifiedFeedbackRule["scope"] = "experiment";
  if (orgKeywords.some((k) => corrLower.includes(k))) scope = "organization";
  else if (input.category_id && categoryKeywords.some((k) => corrLower.includes(k))) scope = "category";
  // Honour legacy applicability when the heuristic is uncertain.
  if (scope === "experiment") {
    if (input.applicability === "broad_rule") scope = "organization";
    else if (input.applicability === "similar_experiment_type" && input.category_id) scope = "category";
  }

  const imperative = toImperative(shortCorr);
  const applicable_rule = scope === "experiment"
    ? `For experiments matching this hypothesis, ${imperative}`
    : scope === "category" && input.category_name
      ? `For ${input.category_name} experiments, ${imperative}`
      : imperative;

  const derived = `For ${input.experiment_type || "this experiment type"} in ${input.domain || "this domain"}, when a generated ${input.item_type} resembles "${shortOrig}", prefer this correction: "${shortCorr}". Reason: ${shortReason}.`;

  const normalizedTags = Array.from(
    new Set(
      [
        ...input.tags,
        input.item_type,
        input.experiment_type,
        input.domain,
        scope === "category" && input.category_id ? `category:${input.category_id}` : null,
        scope === "organization" ? "scope:organization" : null
      ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .map((t) => t.toString().trim().toLowerCase())
        .filter((t) => t.length > 1 && t.length < 64)
    )
  );

  return {
    scope,
    applicable_rule,
    derived_rule: derived,
    normalized_tags: normalizedTags,
    suggested_applicability: input.applicability
  };
}

/**
 * Best-effort conversion from a free-form correction to an imperative.
 * If the correction already starts with a verb, leave it alone but
 * lowercase the first letter so it slots cleanly into a sentence.
 * Otherwise, wrap it with "apply this correction:".
 */
function toImperative(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "apply the scientist's correction.";
  const startsWithVerb = /^(use|avoid|always|never|prefer|include|exclude|set|require|increase|decrease|verify|confirm|run|order|switch|replace|add|remove|swap|measure|record|document|review|approve)\b/i.test(
    trimmed
  );
  if (startsWithVerb) {
    const cleaned = trimmed.replace(/[.!?]+$/, "");
    return cleaned[0].toLowerCase() + cleaned.slice(1) + ".";
  }
  return `apply this correction: ${trimmed.replace(/[.!?]+$/, "")}.`;
}

// Legacy alias kept for older imports. Prefer `heuristicClassification`.
export function heuristicDerivation(input: FeedbackClassificationInput): ClassifiedFeedbackRule {
  return heuristicClassification(input);
}
