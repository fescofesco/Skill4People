export type EnvSnapshot = {
  openaiApiKey: string;
  openaiModel: string;
  tavilyApiKey: string;
  semanticScholarApiKey: string;
  demoFallbackEnabled: boolean;
};

export function getEnv(): EnvSnapshot {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
    tavilyApiKey: process.env.TAVILY_API_KEY || "",
    semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || "",
    demoFallbackEnabled: process.env.ENABLE_DEMO_FALLBACK !== "false"
  };
}

export function summarizeEnv() {
  const env = getEnv();
  return {
    openaiConfigured: Boolean(env.openaiApiKey),
    tavilyConfigured: Boolean(env.tavilyApiKey),
    semanticScholarConfigured: Boolean(env.semanticScholarApiKey),
    demoFallbackEnabled: env.demoFallbackEnabled
  };
}
