import { getEnv } from "@/lib/env";
import { retrieveRelevantFeedback } from "@/lib/feedback-retrieval";
import { mergeEvidenceCards } from "@/lib/evidence";
import { generateExperimentPlan } from "@/lib/plan-generation";
import { searchProtocols } from "@/lib/protocol-search";
import { searchRegulatory } from "@/lib/regulatory-search";
import { searchSuppliers } from "@/lib/supplier-search";
import { ExperimentPlanSchema, GeneratePlanRequestSchema, LiteratureQCSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EvidenceSourceStat = {
  name: string;
  status: "ok" | "empty" | "error" | "skipped";
  count: number;
  durationMs: number;
  error: string | null;
};

async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  fallback: T,
  countOf: (value: T) => number = (v) => (Array.isArray(v) ? v.length : 0)
): Promise<{ value: T; stat: EvidenceSourceStat; count: number }> {
  const startedAt = Date.now();
  try {
    const value = await fn();
    const count = countOf(value);
    return {
      value,
      count,
      stat: {
        name,
        status: count > 0 ? "ok" : "empty",
        count,
        durationMs: Date.now() - startedAt,
        error: null
      }
    };
  } catch (err) {
    return {
      value: fallback,
      count: 0,
      stat: {
        name,
        status: "error",
        count: 0,
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)
      }
    };
  }
}

export async function POST(req: Request) {
  try {
    const env = getEnv();
    const tavilyConfigured = Boolean(env.tavilyApiKey);
    const body = validate(GeneratePlanRequestSchema, await req.json());
    const literatureQC = LiteratureQCSchema.parse(body.literature_qc);
    const parsed = literatureQC.parsed_hypothesis;

    const evidenceStats: EvidenceSourceStat[] = [];

    const [feedback, proto, supp, reg] = await Promise.all([
      retrieveRelevantFeedback({
        hypothesis: body.hypothesis,
        parsed_hypothesis: parsed,
        limit: 7
      }),
      tavilyConfigured
        ? timed("tavily_protocols", () => searchProtocols(body.hypothesis, parsed), [])
        : Promise.resolve({
            value: [],
            count: 0,
            stat: {
              name: "tavily_protocols",
              status: "skipped" as const,
              count: 0,
              durationMs: 0,
              error: "TAVILY_API_KEY not configured"
            }
          }),
      tavilyConfigured
        ? timed("tavily_suppliers", () => searchSuppliers(body.hypothesis, parsed), [])
        : Promise.resolve({
            value: [],
            count: 0,
            stat: {
              name: "tavily_suppliers",
              status: "skipped" as const,
              count: 0,
              durationMs: 0,
              error: "TAVILY_API_KEY not configured"
            }
          }),
      tavilyConfigured
        ? timed(
            "tavily_regulatory",
            () => searchRegulatory(body.hypothesis, parsed),
            { cards: [], reasons: [] },
            (v) => v.cards.length
          )
        : Promise.resolve({
            value: { cards: [], reasons: [] },
            count: 0,
            stat: {
              name: "tavily_regulatory",
              status: "skipped" as const,
              count: 0,
              durationMs: 0,
              error: "TAVILY_API_KEY not configured"
            }
          })
    ]);

    evidenceStats.push(proto.stat, supp.stat, reg.stat);
    const regulatoryReasons = reg.value.reasons;

    const evidenceCards = mergeEvidenceCards(proto.value, supp.value, reg.value.cards);

    const { plan, generation } = await generateExperimentPlan({
      hypothesis: body.hypothesis,
      parsed,
      literatureQC,
      evidenceCards,
      feedback
    });
    const validated = ExperimentPlanSchema.parse(plan);
    return Response.json({
      ...validated,
      _generation: generation,
      _evidence: {
        tavilyConfigured,
        sourceStats: evidenceStats,
        regulatoryReasons,
        cardCount: evidenceCards.length
      }
    });
  } catch (err) {
    return jsonError(err);
  }
}
