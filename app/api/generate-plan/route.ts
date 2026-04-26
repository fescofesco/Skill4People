import { google } from "@ai-sdk/google";
import { streamObject, tool } from "ai";
import { z } from "zod";

import {
  GeminiRateLimitError,
  isGeminiRateLimitError,
  getGeminiRateLimitMessage,
  withGeminiRetry,
} from "@/lib/gemini-rate-limit";
import { embedScientificQuestion } from "@/lib/google-embeddings";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const noveltySignalSchema = z.enum([
  "not found",
  "similar work exists",
  "exact match found",
]);

const referenceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  summary: z.string().min(1),
});

const requestSchema = z.object({
  question: z.string().trim().min(10, "Question must be at least 10 characters."),
  literatureQc: z.object({
    noveltySignal: noveltySignalSchema,
    references: z.array(referenceSchema).min(1).max(3),
  }),
});

const experimentPlanSchema = z.object({
  priorLearnings: z
    .array(
      z.object({
        originalQuery: z.string(),
        correction: z.string(),
      }),
    )
    .describe(
      "A list of past learnings applied to this plan based on retrieved context.",
    ),
  protocol: z
    .array(
      z.object({
        step: z.number().int().positive(),
        title: z.string().min(1),
        methodology: z.string().min(1),
        rationale: z.string().min(1),
      }),
    )
    .min(5)
    .max(10),
  materials: z
    .array(
      z.object({
        item: z.string().min(1),
        supplier: z.string().min(1),
        catalogNumber: z.string().min(1),
        purpose: z.string().min(1),
      }),
    )
    .min(5)
    .max(12),
  budget: z
    .array(
      z.object({
        lineItem: z.string().min(1),
        estimatedCost: z.string().regex(/^[£$€]\d[\d,]*(\.\d{2})?$/),
        notes: z.string().min(1),
      }),
    )
    .min(4)
    .max(10),
  timeline: z
    .array(
      z.object({
        phase: z.string().min(1),
        duration: z.string().min(1),
        dependencies: z.array(z.string().min(1)).min(1),
        deliverable: z.string().min(1),
      }),
    )
    .min(4)
    .max(8),
  validation: z
    .array(
      z.object({
        measure: z.string().min(1),
        successCriteria: z.string().min(1),
        failureMode: z.string().min(1),
      }),
    )
    .min(4)
    .max(8),
});

const tavilyResultSchema = z.object({
  title: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  score: z.number().optional(),
});

type TavilyToolResult = {
  query: string;
  results: Array<{
    title: string;
    url: string;
    summary: string;
    score: number | null;
  }>;
};

type MatchExperimentRow = {
  experiment_id: string;
  original_query: string;
  feedback: Array<{
    section?: string;
    old_value?: unknown;
    corrected_value?: unknown;
    explanation?: string;
  }>;
  similarity: number;
};

type PriorLearning = {
  originalQuery: string;
  correction: string;
};

function truncateText(text: string, maxLength = 650) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function formatFeedbackValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function formatPriorLearning(row: MatchExperimentRow): PriorLearning {
  const corrections = row.feedback
    .map((feedback) =>
      [
        feedback.section ? `Section: ${feedback.section}` : undefined,
        feedback.old_value
          ? `Old value: ${formatFeedbackValue(feedback.old_value)}`
          : undefined,
        feedback.corrected_value
          ? `Corrected value: ${formatFeedbackValue(feedback.corrected_value)}`
          : undefined,
        feedback.explanation ? `Reason: ${feedback.explanation}` : undefined,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean)
    .join("\n");

  return {
    originalQuery: row.original_query,
    correction: corrections,
  };
}

async function retrievePriorLearnings(question: string): Promise<PriorLearning[]> {
  console.info("[generate-plan] Creating question embedding for RAG retrieval");
  const queryEmbedding = await embedScientificQuestion(question);
  const supabase = createSupabaseServiceClient();

  console.info("[generate-plan] Calling match_experiments RPC");
  const { data, error } = await supabase.rpc("match_experiments", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 4,
  });

  if (error) {
    throw new Error(`Supabase RAG retrieval failed: ${error.message}`);
  }

  const rows = (data ?? []) as MatchExperimentRow[];

  return rows.map(formatPriorLearning);
}

async function searchTavily(
  query: string,
  includeDomains: string[],
): Promise<TavilyToolResult> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!tavilyApiKey) {
    throw new Error("Missing TAVILY_API_KEY environment variable.");
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      api_key: tavilyApiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_domains: includeDomains,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");

    throw new Error(
      `Tavily search failed with status ${response.status}. ${details.slice(0, 240)}`,
    );
  }

  const data = (await response.json()) as { results?: unknown[] };
  const results = z.array(tavilyResultSchema).parse(data.results ?? []);

  return {
    query,
    results: results.slice(0, 5).map((result) => ({
      title: result.title ?? "Untitled search result",
      url: result.url ?? "https://tavily.com",
      summary: truncateText(result.content ?? ""),
      score: result.score ?? null,
    })),
  };
}

const planResearchTools = {
  search_protocols: tool({
    description: "Search for existing scientific protocols and methodologies.",
    inputSchema: z.object({
      query: z.string().min(3),
    }),
    execute: async ({ query }) =>
      searchTavily(query, [
        "protocols.io",
        "bio-protocol.org",
        "nature.com",
        "jove.com",
        "openwetware.org",
      ]),
  }),
  search_suppliers: tool({
    description:
      "Search for specific reagents, catalog numbers, and pricing from scientific suppliers.",
    inputSchema: z.object({
      query: z
        .string()
        .min(3)
        .describe("For example: 'anti-CRP antibody catalog number price'."),
    }),
    execute: async ({ query }) =>
      searchTavily(query, [
        "thermofisher.com",
        "sigmaaldrich.com",
        "promega.com",
        "qiagen.com",
        "idtdna.com",
      ]),
  }),
  search_cell_lines_and_reagents: tool({
    description:
      "Search for cell line culturing protocols, cloning data, or biological materials.",
    inputSchema: z.object({
      query: z.string().min(3),
    }),
    execute: async ({ query }) =>
      searchTavily(query, ["atcc.org", "addgene.org"]),
  }),
};

export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable." },
        { status: 500 },
      );
    }

    if (!process.env.TAVILY_API_KEY) {
      return Response.json(
        { error: "Missing TAVILY_API_KEY environment variable." },
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

    const { question, literatureQc } = parsedBody.data;

    const priorLearnings = await retrievePriorLearnings(question);
    console.info(
      `[generate-plan] Retrieved ${priorLearnings.length} prior corrected experiment(s)`,
    );

    const availableToolNames = Object.keys(planResearchTools);
    console.info(
      `[generate-plan] Starting Tavily tool-grounding research with ${availableToolNames.join(", ")}`,
    );
    const [protocols, suppliers, cellLinesAndReagents] = await Promise.all([
      searchTavily(
        `${question} protocol methodology experimental procedure`,
        [
          "protocols.io",
          "bio-protocol.org",
          "nature.com",
          "jove.com",
          "openwetware.org",
        ],
      ),
      searchTavily(
        `${question} reagents catalog number supplier price`,
        [
          "thermofisher.com",
          "sigmaaldrich.com",
          "promega.com",
          "qiagen.com",
          "idtdna.com",
        ],
      ),
      searchTavily(
        `${question} cell line culturing cloning biological materials`,
        ["atcc.org", "addgene.org"],
      ),
    ]);
    const toolGrounding = [
      { toolName: "search_protocols", output: protocols },
      { toolName: "search_suppliers", output: suppliers },
      {
        toolName: "search_cell_lines_and_reagents",
        output: cellLinesAndReagents,
      },
    ];
    console.info(
      `[generate-plan] Tool-grounding complete with ${toolGrounding.length} tool results`,
    );

    const createPlanStream = () =>
      streamObject({
        model: google("gemini-3-flash-preview"),
        schema: experimentPlanSchema,
        schemaName: "ExperimentPlan",
        schemaDescription:
          "A detailed, operationally realistic experiment plan grounded in a scientific question and Literature QC context.",
        temperature: 0.2,
        maxRetries: 0,
        timeout: 60_000,
        system:
          "You are an expert AI Scientist. Before generating the budget, materials, or protocol steps, you MUST use the provided tools to look up real catalog numbers, realistic prices, and grounded methodologies. Do not guess or hallucinate prices or catalog IDs. Use the supplied Tavily tool results as your source of truth. Generate concrete, auditable plans that are realistic for a legitimate research setting. Include controls, dependencies, realistic commercial suppliers, plausible catalog numbers, and measurable success/failure criteria. Review these past corrections carefully. You MUST strictly apply these learnings to the plan you are generating. Also, populate the priorLearnings array with the context you used so the user can see it.",
        prompt: [
          `Scientific question: ${question}`,
          "",
          "Few-Shot Examples / Past Corrections:",
          priorLearnings.length
            ? JSON.stringify(priorLearnings, null, 2)
            : "No prior corrected experiments were retrieved. Return an empty priorLearnings array.",
          "",
          `Literature QC novelty signal: ${literatureQc.noveltySignal}`,
          "",
          "Literature QC references:",
          JSON.stringify(literatureQc.references, null, 2),
          "",
          "Tavily tool-grounding results:",
          JSON.stringify(toolGrounding, null, 2),
          "",
          `Available research tools used before this generation: ${availableToolNames.join(", ")}.`,
          "",
          "Generate a plan that strictly follows the schema. Use concise but specific text. For budget line items, use a single currency symbol and formatted amount such as £1,250 or $850. For catalog numbers, use catalog IDs and supplier/pricing evidence from the Tavily tool-grounding results. If a price is not found, state a realistic estimate and mark the assumption in notes.",
        ].join("\n"),
      });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          await withGeminiRetry("experiment plan stream", async () => {
            console.info("[generate-plan] Starting Google experiment plan stream");
            const result = createPlanStream();

            for await (const partialObject of result.partialObjectStream) {
              controller.enqueue(
                encoder.encode(`${JSON.stringify(partialObject)}\n`),
              );
            }
            console.info("[generate-plan] Experiment plan stream complete");
          });
        } catch (error) {
          console.error("[generate-plan] Experiment plan stream failed", error);
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                error:
                  error instanceof GeminiRateLimitError ||
                  isGeminiRateLimitError(error)
                    ? getGeminiRateLimitMessage(error)
                    : error instanceof Error
                      ? error.message
                      : "Experiment plan generation failed.",
              })}\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("[generate-plan] Tool-grounded plan setup failed", error);
    const isGeminiLimit =
      error instanceof GeminiRateLimitError || isGeminiRateLimitError(error);

    return Response.json(
      {
        error: isGeminiLimit
          ? getGeminiRateLimitMessage(error)
          : error instanceof Error
            ? error.message
            : "Experiment plan generation failed.",
      },
      {
        status: isGeminiLimit ? 429 : 500,
        headers:
          error instanceof GeminiRateLimitError && error.retryAfterMs
            ? { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) }
            : undefined,
      },
    );
  }
}
