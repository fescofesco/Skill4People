import { ZodError, ZodSchema } from "zod";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  recoverable: boolean;

  constructor(opts: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    recoverable?: boolean;
  }) {
    super(opts.message);
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.recoverable = opts.recoverable ?? false;
  }
}

export function validate<T>(schema: ZodSchema<T>, value: unknown, code = "VALIDATION_ERROR"): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError({
      status: 400,
      code,
      message: "Schema validation failed",
      details: result.error.flatten(),
      recoverable: true
    });
  }
  return result.data;
}

export function jsonError(err: unknown): Response {
  const headers = { "content-type": "application/json" };
  if (err instanceof HttpError) {
    return new Response(
      JSON.stringify({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          recoverable: err.recoverable
        }
      }),
      { status: err.status, headers }
    );
  }
  if (err instanceof ZodError) {
    return new Response(
      JSON.stringify({
        error: {
          code: "VALIDATION_ERROR",
          message: "Schema validation failed",
          details: err.flatten(),
          recoverable: true
        }
      }),
      { status: 400, headers }
    );
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return new Response(
    JSON.stringify({
      error: {
        code: "UNKNOWN_ERROR",
        message,
        recoverable: false
      }
    }),
    { status: 500, headers }
  );
}

/**
 * Length-only sanity check on free-form scientific input. We deliberately
 * do NOT keyword-match the text: "Synthesis of a novel yolk-shell
 * nanoparticle…" is a perfectly legitimate research topic that has no
 * "will/would/effect" verb and would fail a regex filter, but is fine for
 * the AI parser. Substance assessment happens downstream via the parser
 * and novelty classifier, both of which return structured uncertainty
 * for vague inputs instead of refusing them.
 */
export function validateHypothesisShape(text: string): { ok: boolean; reason?: string } {
  const t = text.trim();
  if (t.length < 10) return { ok: false, reason: "Hypothesis must be at least 10 characters." };
  if (t.length > 3000) return { ok: false, reason: "Hypothesis must be at most 3000 characters." };
  return { ok: true };
}
