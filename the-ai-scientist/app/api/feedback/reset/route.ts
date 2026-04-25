import { resetFeedback } from "@/lib/feedback-store";
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
            message: "Feedback reset route is disabled in production.",
            recoverable: false
          }
        },
        { status: 403 }
      );
    }
    await resetFeedback();
    return Response.json({ ok: true, count: 0 });
  } catch (err) {
    return jsonError(err);
  }
}
