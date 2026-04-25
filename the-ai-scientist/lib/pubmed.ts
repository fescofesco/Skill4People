import { newReferenceId } from "./ids";
import { Reference } from "./schemas";
import { withTimeout } from "./utils";

const ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

type PubmedSummary = {
  uid: string;
  title?: string;
  authors?: { name: string }[];
  fulljournalname?: string;
  pubdate?: string;
  elocationid?: string;
  articleids?: { idtype: string; value: string }[];
};

export async function searchPubmed(queries: string[]): Promise<Reference[]> {
  const refs: Reference[] = [];
  const seen = new Set<string>();
  for (const q of queries.slice(0, 2)) {
    try {
      const params = new URLSearchParams({
        db: "pubmed",
        term: q,
        retmode: "json",
        retmax: "5"
      });
      const res = await withTimeout(
        fetch(`${ESEARCH}?${params.toString()}`, { cache: "no-store" }),
        10_000,
        "pubmed_search"
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { esearchresult?: { idlist?: string[] } };
      const ids = json.esearchresult?.idlist || [];
      if (ids.length === 0) continue;
      const sumParams = new URLSearchParams({
        db: "pubmed",
        retmode: "json",
        id: ids.join(",")
      });
      const sumRes = await withTimeout(
        fetch(`${ESUMMARY}?${sumParams.toString()}`, { cache: "no-store" }),
        10_000,
        "pubmed_summary"
      );
      if (!sumRes.ok) continue;
      const sumJson = (await sumRes.json()) as {
        result?: Record<string, PubmedSummary | string[] | undefined>;
      };
      const result = sumJson.result || {};
      for (const id of ids) {
        const item = result[id] as PubmedSummary | undefined;
        if (!item || seen.has(id)) continue;
        seen.add(id);
        const doi = item.articleids?.find((a) => a.idtype === "doi")?.value || null;
        const url = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${id}/`;
        const yearMatch = item.pubdate?.match(/(\d{4})/);
        refs.push({
          id: newReferenceId(),
          title: item.title || "Untitled",
          authors: (item.authors || []).map((a) => a.name).slice(0, 6),
          year: yearMatch ? Number(yearMatch[1]) : null,
          venue: item.fulljournalname || null,
          url,
          doi,
          source: "pubmed",
          relevance_reason: "PubMed match",
          relevance_score: 0.6,
          evidence_type: "literature"
        });
      }
    } catch {
      // ignore failures, continue
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return refs;
}
