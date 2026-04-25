import { z } from "zod";
import { chatCompletionsJson, getOpenAIClient } from "./openai";
import { truncate } from "./utils";

const DerivedRuleSchema = z.object({
  derived_rule: z.string().min(1),
  normalized_tags: z.array(z.string()).default([]),
  suggested_applicability: z
    .enum(["only_this_plan", "similar_experiment_type", "broad_rule"])
    .optional()
});

export type DerivedFeedbackRule = z.infer<typeof DerivedRuleSchema>;

export type FeedbackDerivationInput = {
  original_context: string;
  correction: string;
  reason: string;
  item_type: string;
  domain: string;
  experiment_type: string;
  tags: string[];
  applicability: "only_this_plan" | "similar_experiment_type" | "broad_rule";
  severity: "minor" | "important" | "critical";
};

const SYSTEM_PROMPT = `You convert a scientist's correction of a generated experiment plan into a reusable rule for future planning.

Do not overgeneralize. Preserve domain and experiment-specific constraints. If the correction only applies narrowly, say so.

A good derived rule:
- is concise (one to three sentences)
- is actionable
- states the condition where it applies (organism/system, experiment type, item type)
- does not claim universal truth unless the correction explicitly calls for it
- avoids unsupported mechanisms
- can be injected into a future plan-generation prompt

Return only structured JSON with the keys: derived_rule (string), normalized_tags (string[]), suggested_applicability ("only_this_plan" | "similar_experiment_type" | "broad_rule").`;

export async function deriveFeedbackRule(input: FeedbackDerivationInput): Promise<DerivedFeedbackRule> {
  const client = getOpenAIClient();
  if (client) {
    try {
      const userPrompt = JSON.stringify(
        {
          item_type: input.item_type,
          domain: input.domain,
          experiment_type: input.experiment_type,
          original_context: truncate(input.original_context, 1200),
          correction: truncate(input.correction, 1200),
          reason: truncate(input.reason, 800),
          tags: input.tags,
          applicability: input.applicability,
          severity: input.severity
        },
        null,
        2
      );
      const raw = await chatCompletionsJson({
        system: SYSTEM_PROMPT,
        user: `Scientist correction context:\n${userPrompt}\n\nProduce JSON: { "derived_rule": string, "normalized_tags": string[], "suggested_applicability": "only_this_plan" | "similar_experiment_type" | "broad_rule" }`,
        temperature: 0.1
      });
      const parsed = DerivedRuleSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to heuristic
    }
  }
  return heuristicDerivation(input);
}

export function heuristicDerivation(input: FeedbackDerivationInput): DerivedFeedbackRule {
  const shortOrig = truncate(input.original_context.replace(/\s+/g, " "), 140);
  const shortCorr = truncate(input.correction.replace(/\s+/g, " "), 200);
  const shortReason = truncate(input.reason.replace(/\s+/g, " "), 140);
  const derived = `For ${input.experiment_type || "this experiment type"} in ${input.domain || "this domain"}, when a generated ${input.item_type} resembles "${shortOrig}", prefer this correction: "${shortCorr}". Reason: ${shortReason}.`;
  const normalizedTags = Array.from(
    new Set(
      [
        ...input.tags,
        input.item_type,
        input.experiment_type,
        input.domain
      ]
        .map((t) => (t || "").toString().trim().toLowerCase())
        .filter((t) => t.length > 1 && t.length < 64)
    )
  );
  return {
    derived_rule: derived,
    normalized_tags: normalizedTags,
    suggested_applicability: input.applicability
  };
}
