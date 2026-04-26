import { newReferenceId } from "./ids";
import { getEnv } from "./env";
import { ParsedHypothesis, Reference } from "./schemas";
import { tavilyMultiSearch } from "./tavily";

function clampScore(s: number | undefined): number {
  if (typeof s !== "number" || !Number.isFinite(s)) return 0.5;
  return Math.max(0, Math.min(1, s));
}

/**
 * Trusted news / preprint / blog domains that often discuss recent
 * scientific breakthroughs before they reach indexed databases.
 */
const NEWS_DOMAINS = [
  "biorxiv.org",
  "medrxiv.org",
  "arxiv.org",
  "nature.com",
  "sciencemag.org",
  "science.org",
  "phys.org",
  "newscientist.com",
  "technologyreview.com",
  "scientificamerican.com",
  "wired.com",
  "ieee.org",
  "spectrum.ieee.org",
  "techcrunch.com",
  "theverge.com",
  "fiercebiotech.com",
  "statnews.com"
];

const STOP = new Set([
  "the","a","an","and","or","of","in","on","for","to","with","by","into","from","over",
  "is","are","was","were","be","being","been","this","that","these","those","than","then",
  "as","at","its","it","we","our","their","such","using","based","via","per","across","study"
]);

function topicTerms(parsed: ParsedHypothesis, max = 3): string[] {
  const sources = [parsed.intervention, parsed.organism_or_system, parsed.primary_outcome];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of sources) {
    if (!text) continue;
    const tokens = text
      .toLowerCase()
      .replace(/[\(\)\[\]\{\}":;,\.!?\/]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t));
    // Prefer 2-token phrases, fall back to single tokens.
    for (let i = 0; i < tokens.length - 1; i++) {
      const phrase = `${tokens[i]} ${tokens[i + 1]}`;
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      out.push(phrase);
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * Search recent (≤ 90 days) news / preprint / blog coverage of the
 * hypothesis topic. Returns Reference objects so the literature QC novelty
 * panel can show "what's been published this quarter".
 */
export async function searchRecentNews(
  parsed: ParsedHypothesis,
  daysBack = 90
): Promise<Reference[]> {
  const env = getEnv();
  if (!env.tavilyApiKey) return [];
  const terms = topicTerms(parsed, 3);
  if (terms.length === 0) return [];
  const queries = terms.map((t) => `${t} breakthrough OR preprint OR news`);
  const results = await tavilyMultiSearch(queries, {
    maxResults: 4,
    includeDomains: NEWS_DOMAINS,
    topic: "news",
    daysBack,
    searchDepth: "basic"
  });
  return results.slice(0, 6).map((r) => {
    let host = "unknown";
    try {
      host = new URL(r.url).hostname;
    } catch {
      // ignore malformed URL
    }
    return {
      id: newReferenceId(),
      title: r.title,
      authors: [],
      year: null,
      venue: host,
      url: r.url || "not_found",
      doi: null,
      source: "tavily" as const,
      relevance_reason: `Recent news/preprint discussion (≤${daysBack} days) via Tavily`,
      relevance_score: clampScore(r.score),
      evidence_type: "review" as const
    };
  });
}
