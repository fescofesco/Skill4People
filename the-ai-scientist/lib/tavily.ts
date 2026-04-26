import { getEnv } from "./env";
import { withTimeout } from "./utils";

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string | null;
};

export type TavilySearchResponse = {
  query: string;
  results: TavilySearchResult[];
};

const ENDPOINT = "https://api.tavily.com/search";
const EXTRACT_ENDPOINT = "https://api.tavily.com/extract";

export type TavilySearchOptions = {
  maxResults?: number;
  includeDomains?: string[];
  searchDepth?: "basic" | "advanced";
  /** Include the full raw page content per result. Costs more credits but
   *  unlocks price/catalog extraction from product pages. */
  includeRawContent?: boolean;
  /** Tavily topic — "general" (default) or "news". News restricts to recent
   *  press/preprint/blog content with date metadata. */
  topic?: "general" | "news";
  /** Restrict news search to the last N days. Only honored when topic="news". */
  daysBack?: number;
};

export type TavilyExtractResult = {
  url: string;
  raw_content: string;
  status?: string;
};

export async function tavilySearch(
  query: string,
  opts: TavilySearchOptions = {}
): Promise<TavilySearchResponse | null> {
  const env = getEnv();
  if (!env.tavilyApiKey) return null;
  const body: Record<string, unknown> = {
    api_key: env.tavilyApiKey,
    query,
    search_depth: opts.searchDepth || "basic",
    max_results: opts.maxResults ?? 5,
    include_answer: false,
    include_raw_content: opts.includeRawContent ?? false,
    include_domains: opts.includeDomains,
    topic: opts.topic || "general"
  };
  if (opts.topic === "news" && typeof opts.daysBack === "number") {
    body.days = opts.daysBack;
  }
  try {
    const res = await withTimeout(
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store"
      }),
      15_000,
      "tavily"
    );
    if (!res.ok) return null;
    const json = (await res.json()) as TavilySearchResponse;
    if (!json || !Array.isArray(json.results)) return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * Extract the raw text content of a list of URLs via Tavily's /extract API.
 * Useful when search snippets are sparse (e.g. supplier search hit a product
 * page but only returned a short snippet). Capped at 10 URLs per call by
 * Tavily; we batch within that cap and cap raw_content size per result.
 */
export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResult[]> {
  const env = getEnv();
  if (!env.tavilyApiKey || urls.length === 0) return [];
  const unique = Array.from(new Set(urls.filter(Boolean))).slice(0, 10);
  if (unique.length === 0) return [];
  try {
    const res = await withTimeout(
      fetch(EXTRACT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: env.tavilyApiKey, urls: unique }),
        cache: "no-store"
      }),
      20_000,
      "tavily_extract"
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: TavilyExtractResult[] };
    if (!json?.results) return [];
    return json.results.map((r) => ({
      ...r,
      raw_content:
        r.raw_content && r.raw_content.length > 12_000
          ? r.raw_content.slice(0, 12_000)
          : r.raw_content || ""
    }));
  } catch {
    return [];
  }
}

/**
 * Run multiple Tavily searches in parallel and return de-duplicated results.
 *
 * Important fix: previous implementation was sequential with a 200 ms sleep
 * between calls, so 5 advanced+raw queries took ~30 s round-trip. Tavily's
 * dev tier rate-limits per-second, but 5–6 concurrent requests are fine. We
 * also cap raw_content per result so downstream regex extraction stays fast.
 */
export async function tavilyMultiSearch(
  queries: string[],
  opts: TavilySearchOptions = {}
): Promise<TavilySearchResult[]> {
  if (queries.length === 0) return [];
  const settled = await Promise.allSettled(queries.map((q) => tavilySearch(q, opts)));
  const seen = new Set<string>();
  const dedup: TavilySearchResult[] = [];
  for (const s of settled) {
    if (s.status !== "fulfilled" || !s.value?.results) continue;
    for (const item of s.value.results) {
      if (!item.url || seen.has(item.url)) continue;
      seen.add(item.url);
      // Cap raw_content to 12 KB; that's enough for price/catalog regex hits
      // without blowing up memory or downstream regex time.
      if (item.raw_content && item.raw_content.length > 12_000) {
        item.raw_content = item.raw_content.slice(0, 12_000);
      }
      dedup.push(item);
    }
  }
  return dedup;
}
