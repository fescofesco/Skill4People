import { retrieveRelevantFeedback } from "@/lib/feedback-retrieval";
import { FeedbackRetrieveRequestSchema, RetrievedFeedbackSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = validate(FeedbackRetrieveRequestSchema, await req.json());
    const items = await retrieveRelevantFeedback({
      hypothesis: body.hypothesis,
      parsed_hypothesis: body.parsed_hypothesis,
      limit: body.limit ?? 7
    });
    return Response.json({
      ok: true,
      count: items.length,
      feedback: items.map((item) => RetrievedFeedbackSchema.parse(item))
    });
  } catch (err) {
    return jsonError(err);
  }
}
