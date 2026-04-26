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

/**
 * Vercel auto-injected runtime variables documented at
 * https://vercel.com/docs/projects/environment-variables/system-environment-variables
 *
 * Returns nulls when running locally (or outside Vercel) so the UI can
 * cleanly distinguish dev/preview/production.
 */
export type VercelRuntimeInfo = {
  onVercel: boolean;
  env: "production" | "preview" | "development" | null;
  url: string | null;
  region: string | null;
  gitCommitSha: string | null;
  gitCommitShortSha: string | null;
  gitCommitRef: string | null;
  gitProvider: string | null;
  gitRepoOwner: string | null;
  gitRepoSlug: string | null;
};

export function getVercelInfo(): VercelRuntimeInfo {
  // Prefer Vercel's auto-injected SHA (GitHub integration). Fall back to a
  // build-time SHA captured by next.config.mjs so CLI deploys also display
  // the right commit. Local dev shows the local git HEAD via the same path.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_SHA || null;
  const ref = process.env.VERCEL_GIT_COMMIT_REF || process.env.BUILD_REF || null;
  const envName = (process.env.VERCEL_ENV as VercelRuntimeInfo["env"]) || null;
  return {
    onVercel: Boolean(process.env.VERCEL || process.env.VERCEL_URL),
    env: envName,
    url: process.env.VERCEL_URL || null,
    region: process.env.VERCEL_REGION || null,
    gitCommitSha: sha,
    gitCommitShortSha: sha ? sha.slice(0, 7) : null,
    gitCommitRef: ref,
    gitProvider: process.env.VERCEL_GIT_PROVIDER || null,
    gitRepoOwner: process.env.VERCEL_GIT_REPO_OWNER || null,
    gitRepoSlug: process.env.VERCEL_GIT_REPO_SLUG || null
  };
}

export function summarizeEnv() {
  const env = getEnv();
  return {
    openaiConfigured: Boolean(env.openaiApiKey),
    openaiModel: env.openaiModel,
    tavilyConfigured: Boolean(env.tavilyApiKey),
    semanticScholarConfigured: Boolean(env.semanticScholarApiKey),
    demoFallbackEnabled: env.demoFallbackEnabled,
    nodeVersion: process.version,
    runtime: process.env.NEXT_RUNTIME || "nodejs",
    vercel: getVercelInfo()
  };
}
