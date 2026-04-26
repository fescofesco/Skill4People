import { readAllFeedback } from "./feedback-store";
import { cosine, safeEmbedding } from "./openai";
import {
  ParsedHypothesis,
  RetrievedFeedback,
  ScientistFeedback
} from "./schemas";
import { jaccard, tokenize } from "./utils";
import { DEFAULT_ORGANIZATION_ID } from "./org-constants";

const RELATED_DOMAINS: Record<string, string[]> = {
  diagnostics: ["clinical", "biosensor", "biomedical"],
  "gut health": ["microbiology", "microbiome", "animal study", "nutrition"],
  "cell biology": ["molecular biology", "biotechnology", "biology"],
  climate: ["bioenergy", "electrochemistry", "environmental"],
  microbiology: ["gut health", "biology"],
  electrochemistry: ["climate", "diagnostics", "materials science"]
};

function normDomain(d: string): string {
  return d.trim().toLowerCase();
}

function domainMatchScore(a: string, b: string): number {
  const A = normDomain(a);
  const B = normDomain(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.8;
  const relatedA = RELATED_DOMAINS[A] || [];
  const relatedB = RELATED_DOMAINS[B] || [];
  if (relatedA.includes(B) || relatedB.includes(A)) return 0.5;
  return 0;
}

function experimentTypeMatch(a: string, b: string): number {
  const A = normDomain(a);
  const B = normDomain(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const overlap = jaccard(tokenize(A), tokenize(B));
  return overlap > 0.5 ? 1 : overlap > 0.2 ? 0.6 : 0;
}

function applicabilityBoost(applicability: ScientistFeedback["applicability"], samePlan: boolean): number {
  switch (applicability) {
    case "broad_rule":
      return 1;
    case "similar_experiment_type":
      return 0.8;
    case "only_this_plan":
      return samePlan ? 1 : 0.2;
    default:
      return 0.4;
  }
}

function severityConfidenceBoost(item: ScientistFeedback): number {
  const sev = item.severity === "critical" ? 1 : item.severity === "important" ? 0.7 : 0.4;
  const conf = item.confidence ?? 0.5;
  return (sev + conf) / 2;
}

function lexicalScore(query: string, parsed: ParsedHypothesis | undefined, item: ScientistFeedback): number {
  const queryText = [
    query,
    parsed?.intervention,
    parsed?.organism_or_system,
    parsed?.primary_outcome,
    parsed?.mechanism
  ]
    .filter(Boolean)
    .join(" ");

  const itemText = [
    item.applicable_rule,
    item.derived_rule,
    item.original_context,
    item.correction,
    item.tags.join(" "),
    item.experiment_type,
    item.domain
  ]
    .filter(Boolean)
    .join(" ");

  const overlap = jaccard(tokenize(queryText), tokenize(itemText));
  return overlap;
}

/**
 * Severity-then-recency ordering for organization/category buckets where
 * we want consistent priority but no semantic match: critical first, then
 * important, then minor; ties broken by creation timestamp (newest wins).
 */
function severityRank(severity: ScientistFeedback["severity"]): number {
  if (severity === "critical") return 0;
  if (severity === "important") return 1;
  return 2;
}

function compareForFlatBucket(a: ScientistFeedback, b: ScientistFeedback): number {
  const sev = severityRank(a.severity) - severityRank(b.severity);
  if (sev !== 0) return sev;
  const ta = Date.parse(a.created_at) || 0;
  const tb = Date.parse(b.created_at) || 0;
  return tb - ta;
}

/**
 * Resolve the effective organization id and feedback scope for legacy
 * entries that were saved before bucketing existed. If neither field is
 * present, treat the entry as belonging to the default org with a scope
 * derived from `applicability` (broad → organization, similar → category,
 * only_this_plan → experiment). Reads are lazy and idempotent: nothing is
 * written back to disk here.
 */
function resolveOrgAndScope(item: ScientistFeedback): {
  organization_id: string;
  scope: ScientistFeedback["scope"];
  category_id: string | null;
} {
  const organization_id =
    typeof item.organization_id === "string" && item.organization_id.length > 0
      ? item.organization_id
      : DEFAULT_ORGANIZATION_ID;
  const scope: ScientistFeedback["scope"] = item.scope
    ? item.scope
    : item.applicability === "broad_rule"
      ? "organization"
      : item.applicability === "similar_experiment_type"
        ? "category"
        : "experiment";
  const category_id =
    typeof item.category_id === "string" && item.category_id.length > 0
      ? item.category_id
      : null;
  return { organization_id, scope, category_id };
}

export async function retrieveRelevantFeedback(args: {
  hypothesis: string;
  parsed_hypothesis?: ParsedHypothesis;
  source_plan_id?: string;
  limit?: number;
  minScore?: number;
}): Promise<RetrievedFeedback[]> {
  const limit = args.limit ?? 7;
  const minScore = args.minScore ?? 0.25;
  const items = await readAllFeedback();
  if (items.length === 0) return [];

  const queryText = [
    args.hypothesis,
    args.parsed_hypothesis?.intervention,
    args.parsed_hypothesis?.organism_or_system,
    args.parsed_hypothesis?.primary_outcome,
    args.parsed_hypothesis?.mechanism,
    args.parsed_hypothesis?.experiment_type,
    args.parsed_hypothesis?.domain
  ]
    .filter(Boolean)
    .join(" \n ");

  const queryEmbedding = await safeEmbedding(queryText);

  const scored = items.map((item) => {
    const dMatch = domainMatchScore(args.parsed_hypothesis?.domain || "", item.domain);
    const eMatch = experimentTypeMatch(
      args.parsed_hypothesis?.experiment_type || "",
      item.experiment_type
    );
    const tagJ = jaccard(item.tags, args.parsed_hypothesis?.key_variables || []);
    const lex = lexicalScore(args.hypothesis, args.parsed_hypothesis, item);
    const samePlan = !!args.source_plan_id && args.source_plan_id === item.source_plan_id;
    const aBoost = applicabilityBoost(item.applicability, samePlan);
    const scBoost = severityConfidenceBoost(item);

    let lexicalAggregate =
      0.25 * dMatch +
      0.25 * eMatch +
      0.2 * tagJ +
      0.15 * lex +
      0.1 * aBoost +
      0.05 * scBoost;
    lexicalAggregate = Math.max(0, Math.min(1, lexicalAggregate));

    let finalScore = lexicalAggregate;
    let usedEmbedding = false;
    if (queryEmbedding && item.embedding && item.embedding.length === queryEmbedding.vector.length) {
      const cs = cosine(queryEmbedding.vector, item.embedding);
      finalScore = 0.6 * cs + 0.4 * lexicalAggregate;
      usedEmbedding = true;
    }

    const reasonParts: string[] = [];
    if (dMatch >= 0.8) reasonParts.push(`domain match (${item.domain})`);
    if (eMatch >= 0.6) reasonParts.push(`experiment type match (${item.experiment_type})`);
    if (tagJ > 0.2) reasonParts.push(`tag overlap`);
    if (lex > 0.2) reasonParts.push(`keyword overlap`);
    if (item.severity === "critical") reasonParts.push(`critical severity`);
    if (item.applicability === "broad_rule") reasonParts.push(`broad rule`);
    if (usedEmbedding) reasonParts.push(`semantic similarity`);

    return {
      feedback: item,
      similarity_score: Math.max(0, Math.min(1, finalScore)),
      reason: reasonParts.join("; ") || "weak match"
    } satisfies RetrievedFeedback;
  });

  scored.sort((a, b) => b.similarity_score - a.similarity_score);

  const filtered = scored.filter((s) => {
    if (s.feedback.applicability === "broad_rule" && s.feedback.severity === "critical") {
      return s.similarity_score >= 0.2;
    }
    return s.similarity_score >= minScore;
  });

  return filtered.slice(0, limit);
}

export type ActiveFeedbackContext = {
  organization_rules: ScientistFeedback[];
  category_rules: ScientistFeedback[];
  experiment_rules: RetrievedFeedback[];
};

/**
 * Three-bucket retrieval used at plan-generation time:
 *
 *   organization_rules: every rule under the active org with scope=organization.
 *                        Always applied (capped to keep prompt bloat in check).
 *   category_rules:     every rule under (org, category_id) with scope=category.
 *                        Applied for any plan in that category.
 *   experiment_rules:   only when continue_from_plan_id is provided. We pull
 *                        scope=experiment rules tied to that source plan id and
 *                        rerank semantically.
 */
export async function getActiveFeedbackContext(args: {
  organization_id: string;
  category_id: string;
  hypothesis: string;
  parsed_hypothesis?: ParsedHypothesis;
  continue_from_plan_id?: string | null;
  orgLimit?: number;
  categoryLimit?: number;
  experimentLimit?: number;
}): Promise<ActiveFeedbackContext> {
  const all = await readAllFeedback();
  if (all.length === 0) {
    return { organization_rules: [], category_rules: [], experiment_rules: [] };
  }

  const orgLimit = args.orgLimit ?? 12;
  const categoryLimit = args.categoryLimit ?? 12;
  const experimentLimit = args.experimentLimit ?? 7;

  const sameOrg = all.filter((item) => {
    const { organization_id } = resolveOrgAndScope(item);
    return organization_id === args.organization_id;
  });

  const orgBucket: ScientistFeedback[] = [];
  const catBucket: ScientistFeedback[] = [];
  const expCandidates: ScientistFeedback[] = [];

  for (const item of sameOrg) {
    const { scope, category_id } = resolveOrgAndScope(item);
    if (scope === "organization") {
      orgBucket.push(item);
    } else if (scope === "category" && category_id === args.category_id) {
      catBucket.push(item);
    } else if (scope === "experiment") {
      expCandidates.push(item);
    }
  }

  orgBucket.sort(compareForFlatBucket);
  catBucket.sort(compareForFlatBucket);

  let experiment_rules: RetrievedFeedback[] = [];
  if (args.continue_from_plan_id) {
    const tied = expCandidates.filter((it) => it.source_plan_id === args.continue_from_plan_id);
    if (tied.length > 0) {
      experiment_rules = await scoreFeedbackList(tied, args, experimentLimit);
    }
  }

  return {
    organization_rules: orgBucket.slice(0, orgLimit),
    category_rules: catBucket.slice(0, categoryLimit),
    experiment_rules
  };
}

async function scoreFeedbackList(
  items: ScientistFeedback[],
  args: {
    hypothesis: string;
    parsed_hypothesis?: ParsedHypothesis;
  },
  limit: number
): Promise<RetrievedFeedback[]> {
  const queryText = [
    args.hypothesis,
    args.parsed_hypothesis?.intervention,
    args.parsed_hypothesis?.organism_or_system,
    args.parsed_hypothesis?.primary_outcome,
    args.parsed_hypothesis?.mechanism
  ]
    .filter(Boolean)
    .join(" ");
  const queryEmbedding = await safeEmbedding(queryText);

  const scored = items.map((item) => {
    const lex = lexicalScore(args.hypothesis, args.parsed_hypothesis, item);
    const sevBoost = severityConfidenceBoost(item);
    let score = 0.5 * lex + 0.5 * sevBoost;
    let usedEmbedding = false;
    if (queryEmbedding && item.embedding && item.embedding.length === queryEmbedding.vector.length) {
      const cs = cosine(queryEmbedding.vector, item.embedding);
      score = 0.6 * cs + 0.4 * score;
      usedEmbedding = true;
    }
    const reasonParts: string[] = [];
    reasonParts.push(`tied to source plan ${item.source_plan_id}`);
    if (item.severity === "critical") reasonParts.push("critical severity");
    if (lex > 0.2) reasonParts.push("keyword overlap");
    if (usedEmbedding) reasonParts.push("semantic similarity");
    return {
      feedback: item,
      similarity_score: Math.max(0, Math.min(1, score)),
      reason: reasonParts.join("; ")
    } satisfies RetrievedFeedback;
  });

  scored.sort((a, b) => b.similarity_score - a.similarity_score);
  return scored.slice(0, limit);
}

/**
 * Render the three buckets into prompt-ready text. Prefers the
 * AI-rewritten `applicable_rule` directive; falls back to `derived_rule`
 * for legacy entries that don't have one.
 */
export function summarizeFeedbackForPrompt(
  contextOrItems: ActiveFeedbackContext | RetrievedFeedback[],
  options?: { categoryName?: string | null; continueFromPlanId?: string | null }
): string {
  // Backwards-compatible: a flat list of RetrievedFeedback (legacy callers)
  // still works and renders under a single "Relevant feedback" header.
  if (Array.isArray(contextOrItems)) {
    if (contextOrItems.length === 0) return "(none)";
    return contextOrItems
      .map((it, i) => {
        const sev = it.feedback.severity;
        const score = it.similarity_score.toFixed(2);
        const tags = it.feedback.tags.length ? ` [tags: ${it.feedback.tags.join(", ")}]` : "";
        const rule = it.feedback.applicable_rule || it.feedback.derived_rule;
        return `${i + 1}. [id=${it.feedback.id}] [${sev}, score ${score}]${tags} ${rule}`;
      })
      .join("\n");
  }

  const ctx = contextOrItems;
  const sections: string[] = [];

  sections.push("ORGANIZATION POLICIES (always apply):");
  if (ctx.organization_rules.length === 0) {
    sections.push("  (none)");
  } else {
    ctx.organization_rules.forEach((it, i) => {
      const sev = it.severity;
      const tags = it.tags.length ? ` [tags: ${it.tags.join(", ")}]` : "";
      const rule = it.applicable_rule || it.derived_rule;
      sections.push(`  O${i + 1}. [id=${it.id}] [${sev}]${tags} ${rule}`);
    });
  }

  const categoryHeader = options?.categoryName
    ? `CATEGORY RULES — ${options.categoryName} (apply to all experiments in this category):`
    : "CATEGORY RULES (apply to all experiments in this category):";
  sections.push("");
  sections.push(categoryHeader);
  if (ctx.category_rules.length === 0) {
    sections.push("  (none)");
  } else {
    ctx.category_rules.forEach((it, i) => {
      const sev = it.severity;
      const tags = it.tags.length ? ` [tags: ${it.tags.join(", ")}]` : "";
      const rule = it.applicable_rule || it.derived_rule;
      sections.push(`  C${i + 1}. [id=${it.id}] [${sev}]${tags} ${rule}`);
    });
  }

  const experimentHeader = options?.continueFromPlanId
    ? `EXPERIMENT-SPECIFIC LEARNED RULES (continuing from plan ${options.continueFromPlanId}):`
    : "EXPERIMENT-SPECIFIC LEARNED RULES (none — not continuing from a saved plan):";
  sections.push("");
  sections.push(experimentHeader);
  if (ctx.experiment_rules.length === 0) {
    sections.push("  (none)");
  } else {
    ctx.experiment_rules.forEach((it, i) => {
      const sev = it.feedback.severity;
      const score = it.similarity_score.toFixed(2);
      const tags = it.feedback.tags.length ? ` [tags: ${it.feedback.tags.join(", ")}]` : "";
      const rule = it.feedback.applicable_rule || it.feedback.derived_rule;
      sections.push(`  E${i + 1}. [id=${it.feedback.id}] [${sev}, score ${score}]${tags} ${rule}`);
    });
  }

  return sections.join("\n");
}

/**
 * Convert a three-bucket context into the legacy `RetrievedFeedback[]`
 * shape used by older code paths (deterministic plan + applied_feedback
 * tracking). Each org/category rule is given a high pseudo-score so it
 * surfaces at the top of any list, with the reason describing the bucket.
 */
export function flattenActiveContext(ctx: ActiveFeedbackContext): RetrievedFeedback[] {
  const out: RetrievedFeedback[] = [];
  ctx.organization_rules.forEach((item) => {
    out.push({
      feedback: item,
      similarity_score: 1,
      reason: "organization-wide rule"
    });
  });
  ctx.category_rules.forEach((item) => {
    out.push({
      feedback: item,
      similarity_score: 0.95,
      reason: "category-wide rule"
    });
  });
  out.push(...ctx.experiment_rules);
  return out;
}
