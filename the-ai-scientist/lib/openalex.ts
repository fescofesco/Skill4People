import { newReferenceId } from "./ids";
import { Reference } from "./schemas";
import { withTimeout } from "./utils";

const BASE = "https://api.openalex.org/works";

type OpenAlexWork = {
  id: string;
  title: string | null;
  display_name?: string | null;
  doi: string | null;
  publication_year: number | null;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string | null }; landing_page_url?: string | null };
};

export async function searchOpenAlex(queries: string[]): Promise<Reference[]> {
  const refs: Reference[] = [];
  const seen = new Set<string>();
  for (const q of queries.slice(0, 2)) {
    try {
      const params = new URLSearchParams({
        search: q,
        per_page: "5"
      });
      const res = await withTimeout(
        fetch(`${BASE}?${params.toString()}`, {
          headers: {
            "user-agent": "the-ai-scientist/0.1 (mailto:hackathon@example.com)"
          },
          cache: "no-store"
        }),
        10_000,
        "openalex"
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { results?: OpenAlexWork[] };
      const items = json.results || [];
      for (const item of items) {
        const key = item.id || item.title || item.display_name;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        const url =
          item.primary_location?.landing_page_url ||
          (item.doi ? `https://doi.org/${stripDoi(item.doi)}` : null);
        refs.push({
          id: newReferenceId(),
          title: item.title || item.display_name || "Untitled",
          authors: (item.authorships || [])
            .map((a) => a.author?.display_name || "")
            .filter(Boolean)
            .slice(0, 6),
          year: typeof item.publication_year === "number" ? item.publication_year : null,
          venue: item.primary_location?.source?.display_name || null,
          url: url || "not_found",
          doi: item.doi ? stripDoi(item.doi) : null,
          source: "openalex",
          relevance_reason: "OpenAlex match",
          relevance_score: 0.55,
          evidence_type: "literature"
        });
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return refs;
}

function stripDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
}
