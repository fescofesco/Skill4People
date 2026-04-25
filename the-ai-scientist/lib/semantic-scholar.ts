import { newReferenceId } from "./ids";
import { Reference } from "./schemas";
import { getEnv } from "./env";
import { withTimeout } from "./utils";

const BASE = "https://api.semanticscholar.org/graph/v1/paper/search";
const FIELDS = "title,authors,year,venue,url,externalIds,abstract,citationCount,paperId";

export type SemanticScholarHit = {
  paperId: string;
  title: string;
  authors?: { name: string }[];
  year?: number | null;
  venue?: string | null;
  url?: string | null;
  externalIds?: Record<string, string> | null;
  abstract?: string | null;
  citationCount?: number | null;
};

export async function searchSemanticScholarOne(
  query: string,
  limit = 5
): Promise<SemanticScholarHit[]> {
  const env = getEnv();
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FIELDS
  });
  const url = `${BASE}?${params.toString()}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": "the-ai-scientist/0.1 (hackathon prototype)"
  };
  if (env.semanticScholarApiKey) headers["x-api-key"] = env.semanticScholarApiKey;
  try {
    const res = await withTimeout(
      fetch(url, { headers, cache: "no-store" }),
      12_000,
      "semantic_scholar"
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: SemanticScholarHit[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

export async function searchSemanticScholar(queries: string[]): Promise<Reference[]> {
  const all: SemanticScholarHit[] = [];
  // Limit to 4 queries to avoid rate limits during demo
  for (const q of queries.slice(0, 4)) {
    const hits = await searchSemanticScholarOne(q, 5);
    for (const h of hits) all.push(h);
    // gentle backoff
    await new Promise((r) => setTimeout(r, 250));
  }
  const seen = new Set<string>();
  const refs: Reference[] = [];
  for (const h of all) {
    const key = h.paperId || h.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const doi = h.externalIds?.DOI || null;
    const url = h.url || (doi ? `https://doi.org/${doi}` : null);
    refs.push({
      id: newReferenceId(),
      title: h.title || "Untitled",
      authors: (h.authors || []).map((a) => a.name).filter(Boolean).slice(0, 8),
      year: typeof h.year === "number" ? h.year : null,
      venue: h.venue || null,
      url: url ? (url as string) : "not_found",
      doi: doi || null,
      source: "semantic_scholar",
      relevance_reason: scoreReason(h),
      relevance_score: relevanceFromHit(h),
      evidence_type: "literature"
    });
  }
  return refs;
}

function scoreReason(h: SemanticScholarHit): string {
  const yearStr = h.year ? `, ${h.year}` : "";
  const venueStr = h.venue ? ` in ${h.venue}` : "";
  return `Semantic Scholar match${venueStr}${yearStr}`;
}

function relevanceFromHit(h: SemanticScholarHit): number {
  // Use citation count as a soft signal; cap to 1.
  const cc = h.citationCount ?? 0;
  const base = 0.55;
  const boost = Math.min(0.4, Math.log10(1 + cc) / 5);
  return Math.min(1, base + boost);
}
