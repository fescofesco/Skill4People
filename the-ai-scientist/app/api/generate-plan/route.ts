import { getCategory } from "@/lib/category-store";
import { listDocuments } from "@/lib/document-store";
import { getEnv } from "@/lib/env";
import { getActiveFeedbackContext } from "@/lib/feedback-retrieval";
import { mergeEvidenceCards } from "@/lib/evidence";
import { generateExperimentPlan } from "@/lib/plan-generation";
import { critiquePlan } from "@/lib/plan-critic";
import { readOrganizationId } from "@/lib/org-server";
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
    const json = await req.json();
    const organizationId = readOrganizationId(req, json);
    const body = validate(GeneratePlanRequestSchema, json);
    const literatureQC = LiteratureQCSchema.parse(body.literature_qc);
    const parsed = literatureQC.parsed_hypothesis;
    const categoryId = body.category_id || "other";
    const continueFromPlanId = body.continue_from_plan_id ?? null;

    const evidenceStats: EvidenceSourceStat[] = [];

    const categoryRecord = await getCategory(organizationId, categoryId);
    const categoryName = categoryRecord?.name || null;

    const [orgDocs, experimentDocs] = await Promise.all([
      listDocuments({ organization_id: organizationId, scope: "organization" }),
      continueFromPlanId
        ? listDocuments({
            organization_id: organizationId,
            scope: "experiment",
            plan_id: continueFromPlanId
          })
        : Promise.resolve([])
    ]);
    const documents = { organization: orgDocs, experiment: experimentDocs };

    const [feedbackContext, proto, supp, reg] = await Promise.all([
      getActiveFeedbackContext({
        organization_id: organizationId,
        category_id: categoryId,
        hypothesis: body.hypothesis,
        parsed_hypothesis: parsed,
        continue_from_plan_id: continueFromPlanId
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
      feedback: [],
      feedbackContext,
      categoryId,
      categoryName,
      continueFromPlanId,
      documents
    });
    const validated = ExperimentPlanSchema.parse(plan);
    // Run a critic pass over the validated plan. AI-first, heuristic fallback.
    // Never blocks plan delivery: any error is captured into _critique.errors.
    const critique = await critiquePlan(validated, literatureQC).catch((err) => ({
      source: "heuristic" as const,
      model: null,
      overall_assessment: "needs_work" as const,
      findings: [],
      errors: [
        "critique_unhandled_error: " +
          (err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240))
      ]
    }));
    return Response.json({
      ...validated,
      _generation: generation,
      _evidence: {
        tavilyConfigured,
        sourceStats: evidenceStats,
        regulatoryReasons,
        cardCount: evidenceCards.length
      },
      _critique: critique,
      _context: {
        organization_id: organizationId,
        category_id: categoryId,
        category_name: categoryName,
        continue_from_plan_id: continueFromPlanId,
        documents: {
          organization_count: orgDocs.length,
          experiment_count: experimentDocs.length,
          organization_ids: orgDocs.map((d) => d.id),
          experiment_ids: experimentDocs.map((d) => d.id)
        }
      }
    });
  } catch (err) {
    return jsonError(err);
  }
}
