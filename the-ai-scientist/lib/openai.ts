import OpenAI from "openai";
import { getEnv } from "./env";

let cachedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI | null {
  const env = getEnv();
  if (!env.openaiApiKey) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new OpenAI({
    apiKey: env.openaiApiKey,
    timeout: 60_000,
    maxRetries: 1
  });
  return cachedClient;
}

export function getOpenAIModel(): string {
  return getEnv().openaiModel;
}

/**
 * Call chat completions and return parsed JSON from the response.
 * Uses response_format json_object. Caller must validate with Zod.
 */
export async function chatCompletionsJson(args: {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  maxTokens?: number;
}): Promise<unknown> {
  const client = getOpenAIClient();
  if (!client) throw new Error("MISSING_OPENAI_API_KEY");
  const model = args.model || getOpenAIModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: args.temperature ?? 0.2,
    max_tokens: args.maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("OPENAI_EMPTY_RESPONSE");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("OPENAI_INVALID_JSON");
  }
}

/**
 * Optional embedding helper. Returns null if no API key or call fails.
 */
export async function safeEmbedding(text: string): Promise<{ vector: number[]; model: string } | null> {
  const client = getOpenAIClient();
  if (!client) return null;
  try {
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text.slice(0, 8000)
    });
    const vec = res.data?.[0]?.embedding;
    if (!vec) return null;
    return { vector: vec, model: "text-embedding-3-small" };
  } catch {
    return null;
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
