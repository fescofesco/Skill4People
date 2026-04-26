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

export type TavilySearchOptions = {
  maxResults?: number;
  includeDomains?: string[];
  searchDepth?: "basic" | "advanced";
  /** Include the full raw page content per result. Costs more credits but
   *  unlocks price/catalog extraction from product pages. */
  includeRawContent?: boolean;
};

export async function tavilySearch(
  query: string,
  opts: TavilySearchOptions = {}
): Promise<TavilySearchResponse | null> {
  const env = getEnv();
  if (!env.tavilyApiKey) return null;
  const body = {
    api_key: env.tavilyApiKey,
    query,
    search_depth: opts.searchDepth || "basic",
    max_results: opts.maxResults ?? 5,
    include_answer: false,
    include_raw_content: opts.includeRawContent ?? false,
    include_domains: opts.includeDomains
  };
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

export async function tavilyMultiSearch(
  queries: string[],
  opts: TavilySearchOptions = {}
): Promise<TavilySearchResult[]> {
  const out: TavilySearchResult[] = [];
  for (const q of queries) {
    const r = await tavilySearch(q, opts);
    if (r?.results) {
      for (const item of r.results) out.push(item);
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  // dedupe by url
  const seen = new Set<string>();
  const dedup: TavilySearchResult[] = [];
  for (const r of out) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    dedup.push(r);
  }
  return dedup;
}
