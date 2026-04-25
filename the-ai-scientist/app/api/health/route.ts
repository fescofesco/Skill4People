import { summarizeEnv } from "@/lib/env";
import { feedbackStoreStatus } from "@/lib/feedback-store";
import { HealthResponseSchema } from "@/lib/schemas";
import { jsonError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = HealthResponseSchema.parse({
      ok: true,
      timestamp: new Date().toISOString(),
      env: summarizeEnv(),
      feedbackStore: await feedbackStoreStatus()
    });
    return Response.json(response);
  } catch (err) {
    return jsonError(err);
  }
}
