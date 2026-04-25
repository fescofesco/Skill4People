import { retrieveRelevantFeedback } from "@/lib/feedback-retrieval";
import { mergeEvidenceCards } from "@/lib/evidence";
import { generateExperimentPlan } from "@/lib/plan-generation";
import { searchProtocols } from "@/lib/protocol-search";
import { searchSuppliers } from "@/lib/supplier-search";
import { ExperimentPlanSchema, GeneratePlanRequestSchema, LiteratureQCSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = validate(GeneratePlanRequestSchema, await req.json());
    const literatureQC = LiteratureQCSchema.parse(body.literature_qc);
    const parsed = literatureQC.parsed_hypothesis;
    const [feedback, protocolEvidence, supplierEvidence] = await Promise.all([
      retrieveRelevantFeedback({
        hypothesis: body.hypothesis,
        parsed_hypothesis: parsed,
        limit: 7
      }),
      searchProtocols(body.hypothesis, parsed),
      searchSuppliers(body.hypothesis, parsed)
    ]);
    const evidenceCards = mergeEvidenceCards(protocolEvidence, supplierEvidence);
    const plan = await generateExperimentPlan({
      hypothesis: body.hypothesis,
      parsed,
      literatureQC,
      evidenceCards,
      feedback
    });
    return Response.json(ExperimentPlanSchema.parse(plan));
  } catch (err) {
    return jsonError(err);
  }
}
