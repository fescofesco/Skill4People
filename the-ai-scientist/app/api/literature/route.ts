import { runLiteratureQC } from "@/lib/literature";
import { LiteratureRequestSchema, LiteratureQCSchema } from "@/lib/schemas";
import { jsonError, validate, validateHypothesisShape } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = validate(LiteratureRequestSchema, await req.json());
    const shape = validateHypothesisShape(body.hypothesis);
    if (!shape.ok) {
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: shape.reason || "Invalid hypothesis",
            recoverable: true
          }
        },
        { status: 400 }
      );
    }
    const { qc, diagnostics } = await runLiteratureQC(body.hypothesis);
    const parsed = LiteratureQCSchema.parse(qc);
    return Response.json({ ...parsed, _diagnostics: diagnostics });
  } catch (err) {
    return jsonError(err);
  }
}
