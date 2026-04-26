const DEFAULT_MIN_INTERVAL_MS = 12_000;
const DEFAULT_RETRY_DELAYS_MS = [15_000, 30_000];

let nextAllowedRequestAt = 0;

export class GeminiRateLimitError extends Error {
  retryAfterMs: number | null;
  isDailyQuota: boolean;

  constructor({
    message,
    retryAfterMs,
    isDailyQuota,
  }: {
    message: string;
    retryAfterMs: number | null;
    isDailyQuota: boolean;
  }) {
    super(message);
    this.name = "GeminiRateLimitError";
    this.retryAfterMs = retryAfterMs;
    this.isDailyQuota = isDailyQuota;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getMinIntervalMs() {
  const configured = Number(process.env.GEMINI_MIN_INTERVAL_MS);

  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MIN_INTERVAL_MS;
}

function getErrorProperty<T>(error: unknown, property: string): T | undefined {
  if (typeof error !== "object" || error === null || !(property in error)) {
    return undefined;
  }

  return (error as Record<string, T>)[property];
}

function unwrapError(error: unknown): unknown {
  const lastError = getErrorProperty<unknown>(error, "lastError");

  if (lastError) {
    return lastError;
  }

  const errors = getErrorProperty<unknown[]>(error, "errors");

  return errors?.at(-1) ?? error;
}

function getRetryAfterFromText(text: string) {
  const retryMatch = text.match(/retry (?:in|after)\s+(\d+(?:\.\d+)?)s/i);

  return retryMatch ? Number(retryMatch[1]) * 1_000 : null;
}

function getRetryAfterMs(error: unknown) {
  const unwrapped = unwrapError(error);
  const headers =
    getErrorProperty<Record<string, string> | undefined>(
      unwrapped,
      "responseHeaders",
    ) ?? undefined;
  const retryAfter = headers?.["retry-after"] ?? headers?.["Retry-After"];

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return seconds * 1_000;
    }

    const retryAt = Date.parse(retryAfter);

    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
  }

  const responseBody =
    getErrorProperty<string | undefined>(unwrapped, "responseBody") ?? "";

  try {
    const parsed = JSON.parse(responseBody) as {
      error?: { message?: string; details?: Array<Record<string, unknown>> };
    };
    const retryInfo = parsed.error?.details?.find(
      (detail) =>
        detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
    );
    const retryDelay = retryInfo?.retryDelay;

    if (typeof retryDelay === "string" && retryDelay.endsWith("s")) {
      const seconds = Number(retryDelay.slice(0, -1));

      if (Number.isFinite(seconds)) {
        return seconds * 1_000;
      }
    }

    if (parsed.error?.message) {
      return getRetryAfterFromText(parsed.error.message);
    }
  } catch {
    // Fall through to message parsing.
  }

  const message = error instanceof Error ? error.message : "";

  return getRetryAfterFromText(message);
}

function getQuotaId(error: unknown) {
  const unwrapped = unwrapError(error);
  const responseBody =
    getErrorProperty<string | undefined>(unwrapped, "responseBody") ?? "";

  try {
    const parsed = JSON.parse(responseBody) as {
      error?: { details?: Array<Record<string, unknown>> };
    };
    const quotaFailure = parsed.error?.details?.find(
      (detail) =>
        detail["@type"] === "type.googleapis.com/google.rpc.QuotaFailure",
    );
    const violations = quotaFailure?.violations;

    if (Array.isArray(violations)) {
      const violation = violations[0] as
        | { quotaId?: string; quotaMetric?: string; quotaValue?: string }
        | undefined;

      return violation?.quotaId ?? violation?.quotaMetric ?? null;
    }
  } catch {
    // Fall through to message parsing.
  }

  const message = error instanceof Error ? error.message : "";
  const quotaMatch = message.match(/quota exceeded for metric:\s*([^,\n]+)/i);

  return quotaMatch?.[1] ?? null;
}

export function getGeminiRateLimitMessage(error: unknown) {
  const unwrapped = unwrapError(error);
  const message =
    unwrapped instanceof Error
      ? unwrapped.message
      : error instanceof Error
        ? error.message
        : "Gemini rate limit exceeded.";
  const quotaId = getQuotaId(error);
  const retryAfterMs = getRetryAfterMs(error);
  const retryText = retryAfterMs
    ? ` Retry after about ${Math.ceil(retryAfterMs / 1000)} seconds.`
    : "";

  if (quotaId?.toLowerCase().includes("perday")) {
    return `Gemini free-tier daily quota is exhausted for this model.${retryText} Check Google AI Studio quotas or wait for the daily reset.`;
  }

  return `${message}${retryText}`;
}

export function isGeminiRateLimitError(error: unknown) {
  const unwrapped = unwrapError(error);
  const statusCode =
    getErrorProperty<number | undefined>(unwrapped, "statusCode") ?? undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    statusCode === 429 ||
    message.includes("429") ||
    message.includes("quota") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}

function isDailyQuotaError(error: unknown) {
  const quotaId = getQuotaId(error)?.toLowerCase() ?? "";

  return quotaId.includes("perday") || quotaId.includes("free_tier_requests");
}

export async function waitForGeminiSlot(label: string) {
  const now = Date.now();
  const waitMs = Math.max(0, nextAllowedRequestAt - now);

  if (waitMs > 0) {
    console.info(`[gemini] Waiting ${Math.ceil(waitMs / 1000)}s before ${label}`);
    await sleep(waitMs);
  }

  nextAllowedRequestAt = Date.now() + getMinIntervalMs();
}

export async function withGeminiRetry<T>(
  label: string,
  operation: () => Promise<T>,
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DEFAULT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      await waitForGeminiSlot(`${label} attempt ${attempt + 1}`);
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isGeminiRateLimitError(error)) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);

      if (isDailyQuotaError(error)) {
        throw new GeminiRateLimitError({
          message: getGeminiRateLimitMessage(error),
          retryAfterMs,
          isDailyQuota: true,
        });
      }

      if (attempt === DEFAULT_RETRY_DELAYS_MS.length) {
        throw new GeminiRateLimitError({
          message: getGeminiRateLimitMessage(error),
          retryAfterMs,
          isDailyQuota: false,
        });
      }

      const fallbackDelayMs = DEFAULT_RETRY_DELAYS_MS[attempt];
      const delayMs = Math.max(retryAfterMs ?? 0, fallbackDelayMs);

      console.warn(
        `[gemini] Rate limited during ${label}; retrying in ${Math.ceil(
          delayMs / 1000,
        )}s`,
      );
      nextAllowedRequestAt = Math.max(nextAllowedRequestAt, Date.now() + delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
