import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";

import {
  GeminiRateLimitError,
  isGeminiRateLimitError,
  getGeminiRateLimitMessage,
  withGeminiRetry,
} from "@/lib/gemini-rate-limit";

const requestSchema = z.object({
  question: z.string().trim().min(10, "Question must be at least 10 characters."),
});

const literatureQcSchema = z.object({
  noveltySignal: z.enum([
    "not found",
    "similar work exists",
    "exact match found",
  ]),
  references: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().url(),
        summary: z.string().min(1),
      }),
    )
    .min(1)
    .max(3),
});

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
  raw_content?: string;
};

type TavilyResponse = {
  answer?: string;
  results?: TavilyResult[];
};

function truncateText(text: string, maxLength = 700) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const start = candidate.indexOf("{");

  if (start === -1) {
    throw new Error("Gemini did not return a JSON object.");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return JSON.parse(candidate.slice(start, index + 1));
      }
    }
  }

  throw new Error("Gemini returned incomplete JSON.");
}

async function readErrorBody(response: Response) {
  const text = await response.text().catch(() => "");

  return text ? ` ${text.slice(0, 300)}` : "";
}

export async function POST(request: Request) {
  try {
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    if (!tavilyApiKey) {
      return Response.json(
        { error: "Missing TAVILY_API_KEY environment variable." },
        { status: 500 },
      );
    }

    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable." },
        { status: 500 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsedBody = requestSchema.safeParse(body);

    if (!parsedBody.success) {
      return Response.json(
        { error: parsedBody.error.issues[0]?.message ?? "Invalid request body." },
        { status: 400 },
      );
    }

    const { question } = parsedBody.data;
    console.info("[research] Starting Tavily literature search");

    const tavilyResponse = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        api_key: tavilyApiKey,
        query: `${question} scientific literature protocol paper study`,
        search_depth: "advanced",
        max_results: 8,
        include_answer: true,
        include_raw_content: false,
        include_domains: [
          "protocols.io",
          "nature.com",
          "ncbi.nlm.nih.gov",
          "pubmed.ncbi.nlm.nih.gov",
          "science.org",
          "cell.com",
          "biorxiv.org",
          "medrxiv.org",
          "frontiersin.org",
        ],
      }),
    });

    if (!tavilyResponse.ok) {
      const details = await readErrorBody(tavilyResponse);

      return Response.json(
        {
          error: `Tavily literature search failed with status ${tavilyResponse.status}.${details}`,
        },
        { status: 502 },
      );
    }

    const tavilyData = (await tavilyResponse.json()) as TavilyResponse;
    const searchResults = (tavilyData.results ?? [])
      .filter((result) => result.title && result.url)
      .slice(0, 5)
      .map((result, index) => ({
        rank: index + 1,
        title: result.title,
        url: result.url,
        summary: truncateText(result.content ?? result.raw_content ?? ""),
        score: result.score,
      }));
    console.info(`[research] Tavily returned ${searchResults.length} candidates`);

    if (searchResults.length === 0) {
      return Response.json({
        noveltySignal: "not found",
        references: [
          {
            title: "No relevant literature or protocol candidates returned",
            url: "https://tavily.com",
            summary:
              "Tavily did not return a usable paper or protocol candidate for this question. Broaden the question or try a more explicit organism, intervention, and endpoint.",
          },
        ],
      });
    }

    console.info("[research] Starting Google structured QC parsing");
    const result = await withGeminiRetry("literature QC parsing", () =>
      generateText({
        model: google("gemini-3-flash-preview"),
        temperature: 0,
        maxOutputTokens: 900,
        maxRetries: 0,
        timeout: 60_000,
        providerOptions: {
          google: {
            responseModalities: ["TEXT"],
            thinkingConfig: {
              includeThoughts: false,
              thinkingBudget: 0,
            },
          },
        },
        system:
          "You are a scientific literature quality-control assistant. Classify whether a user's proposed scientific question appears novel based only on the Tavily search results provided. Return only valid JSON. Do not include markdown, prose, or code fences.",
        prompt: [
          `Scientific question: ${question}`,
          "",
          "Return JSON with exactly this shape:",
          '{ "noveltySignal": "not found | similar work exists | exact match found", "references": [{ "title": "string", "url": "https://...", "summary": "one sentence" }] }',
          "",
          "Rules:",
          "- noveltySignal must be exactly one of: not found, similar work exists, exact match found.",
          "- references must contain 1 to 3 items.",
          "- Each reference must use a URL from the search results.",
          "- Each summary must be brief and based only on the search result text.",
          "",
          "Classify noveltySignal as:",
          "- not found: no close literature/protocol match is present in the results.",
          "- similar work exists: related studies or protocols exist, but they do not directly answer the same question.",
          "- exact match found: a result appears to directly answer or implement the same question.",
          "",
          `Tavily answer: ${truncateText(tavilyData.answer ?? "No answer returned.", 500)}`,
          "",
          `Search results JSON: ${JSON.stringify(searchResults)}`,
        ].join("\n"),
      }),
    );
    const textParts = result.content
      .filter((part) => part.type === "text")
      .map((part) => part.text);
    const rawOutput = [result.text, result.reasoningText, ...textParts]
      .filter(Boolean)
      .join("\n");

    console.info(
      `[research] Google QC finish reason: ${result.finishReason}; text length: ${rawOutput.length}`,
    );
    const object = literatureQcSchema.parse(parseJsonObject(rawOutput));
    console.info("[research] Literature QC parsing complete");

    return Response.json(object);
  } catch (error) {
    console.error("[research] Literature QC failed", error);

    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    const isGeminiLimit =
      error instanceof GeminiRateLimitError || isGeminiRateLimitError(error);

    return Response.json(
      {
        error: isTimeout
          ? "Literature QC timed out. Tavily or Gemini did not respond in time."
          : isGeminiLimit
            ? getGeminiRateLimitMessage(error)
          : error instanceof Error
            ? error.message
            : "Literature QC failed.",
      },
      {
        status: isTimeout ? 504 : isGeminiLimit ? 429 : 500,
        headers:
          error instanceof GeminiRateLimitError && error.retryAfterMs
            ? { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) }
            : undefined,
      },
    );
  }
}
