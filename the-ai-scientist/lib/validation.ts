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

export function validateHypothesisShape(text: string): { ok: boolean; reason?: string } {
  const t = text.trim();
  if (t.length < 20) return { ok: false, reason: "Hypothesis must be at least 20 characters." };
  if (t.length > 3000) return { ok: false, reason: "Hypothesis must be at most 3000 characters." };
  const lowered = t.toLowerCase();
  const hasVerb = /\b(will|would|may|could|increase|decrease|reduce|enhance|outperform|detect|fix|produce|generate|prevent|improve|exhibit|cause|cure|catalyze)\b/.test(
    lowered
  );
  const hasNoun = /\b(hypothesis|effect|cells?|protein|biosensor|mice|rats?|microbe|enzyme|cathode|anode|catalyst|antibody|gene|culture|sample|patient|tissue|reactor|substrate|membrane|particle|polymer|biomarker|metabolite|temperature|pressure|expression|reaction|electrode|reagent|treatment|drug|vaccine)\b/.test(
    lowered
  );
  if (!hasVerb && !hasNoun) {
    return {
      ok: false,
      reason:
        "Input does not look like a scientific hypothesis. Include an intervention, system, and measurable outcome."
    };
  }
  return { ok: true };
}
