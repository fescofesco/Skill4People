import { replaceAllFeedback } from "@/lib/feedback-store";
import { buildSeedFeedback } from "@/lib/seed-feedback";
import { jsonError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      return Response.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Feedback seed route is disabled in production.",
            recoverable: false
          }
        },
        { status: 403 }
      );
    }
    const feedback = buildSeedFeedback();
    await replaceAllFeedback(feedback);
    return Response.json({ ok: true, count: feedback.length, feedback });
  } catch (err) {
    return jsonError(err);
  }
}
