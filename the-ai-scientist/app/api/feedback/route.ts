import { appendFeedback, readAllFeedback } from "@/lib/feedback-store";
import { deriveFeedbackRule } from "@/lib/feedback-prompts";
import { newFeedbackId } from "@/lib/ids";
import { safeEmbedding } from "@/lib/openai";
import { FeedbackCreateRequestSchema, ScientistFeedbackSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const feedback = await readAllFeedback();
    return Response.json({ ok: true, count: feedback.length, feedback });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = validate(FeedbackCreateRequestSchema, await req.json());
    const tags = body.tags ?? [];
    const derived = await deriveFeedbackRule({ ...body, tags });
    const embedding = await safeEmbedding(
      [
        derived.derived_rule,
        tags.join(" "),
        body.domain,
        body.experiment_type,
        body.item_type
      ].join("\n")
    );

    const feedback = ScientistFeedbackSchema.parse({
      id: newFeedbackId(),
      created_at: new Date().toISOString(),
      ...body,
      derived_rule: derived.derived_rule,
      tags: derived.normalized_tags.length ? derived.normalized_tags : tags,
      applicability: derived.suggested_applicability || body.applicability,
      embedding: embedding?.vector,
      embedding_model: embedding?.model
    });
    await appendFeedback(feedback);
    return Response.json({ ok: true, feedback });
  } catch (err) {
    return jsonError(err);
  }
}
