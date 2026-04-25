import { readAllFeedback } from "./feedback-store";
import { cosine, safeEmbedding } from "./openai";
import {
  ParsedHypothesis,
  RetrievedFeedback,
  ScientistFeedback
} from "./schemas";
import { jaccard, tokenize } from "./utils";

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

  // Compute optional embedding for hypothesis
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

export function summarizeFeedbackForPrompt(items: RetrievedFeedback[]): string {
  if (items.length === 0) return "(none)";
  return items
    .map((it, i) => {
      const sev = it.feedback.severity;
      const score = it.similarity_score.toFixed(2);
      const tags = it.feedback.tags.length ? ` [tags: ${it.feedback.tags.join(", ")}]` : "";
      return `${i + 1}. [id=${it.feedback.id}] [${sev}, score ${score}]${tags} ${it.feedback.derived_rule}`;
    })
    .join("\n");
}
