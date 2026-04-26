import { google } from "@ai-sdk/google";
import { embed } from "ai";

import { withGeminiRetry } from "@/lib/gemini-rate-limit";

export async function embedScientificQuestion(question: string) {
  const { embedding } = await withGeminiRetry("scientific question embedding", () =>
    embed({
      model: google.embedding("gemini-embedding-001"),
      value: question,
      providerOptions: {
        google: {
          taskType: "SEMANTIC_SIMILARITY",
          outputDimensionality: 768,
        },
      },
      maxRetries: 0,
    }),
  );

  return embedding;
}
