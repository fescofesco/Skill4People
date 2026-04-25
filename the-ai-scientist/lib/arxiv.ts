import { newReferenceId } from "./ids";
import { Reference } from "./schemas";
import { withTimeout } from "./utils";

const BASE = "https://export.arxiv.org/api/query";

export async function searchArxiv(queries: string[]): Promise<Reference[]> {
  const refs: Reference[] = [];
  const seen = new Set<string>();
  for (const q of queries.slice(0, 3)) {
    const params = new URLSearchParams({
      search_query: `all:${q}`,
      start: "0",
      max_results: "5",
      sortBy: "relevance",
      sortOrder: "descending"
    });
    try {
      const res = await withTimeout(
        fetch(`${BASE}?${params.toString()}`, {
          headers: { accept: "application/atom+xml" },
          cache: "no-store"
        }),
        12_000,
        "arxiv"
      );
      if (!res.ok) continue;
      const text = await res.text();
      const entries = parseArxivAtom(text);
      for (const e of entries) {
        const key = e.id || e.title;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        refs.push({
          id: newReferenceId(),
          title: e.title || "Untitled",
          authors: e.authors,
          year: e.year ?? null,
          venue: "arXiv",
          url: e.url || "not_found",
          doi: e.doi || null,
          source: "arxiv",
          relevance_reason: "arXiv preprint match",
          relevance_score: 0.6,
          evidence_type: "literature"
        });
      }
    } catch {
      // continue with next query
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return refs;
}

type ArxivParsed = {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  url: string | null;
  doi: string | null;
};

function parseArxivAtom(xml: string): ArxivParsed[] {
  const entries: ArxivParsed[] = [];
  const blocks = xml.split(/<entry>/i).slice(1);
  for (const raw of blocks) {
    const block = "<entry>" + raw.split(/<\/entry>/i)[0] + "</entry>";
    const id = match(block, /<id>([\s\S]*?)<\/id>/);
    const title = match(block, /<title>([\s\S]*?)<\/title>/)?.replace(/\s+/g, " ").trim() || "";
    const published = match(block, /<published>([\s\S]*?)<\/published>/);
    const year = published ? Number(published.slice(0, 4)) : null;
    const authors: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let m: RegExpExecArray | null;
    while ((m = authorRegex.exec(block)) !== null) {
      authors.push(m[1].trim());
      if (authors.length >= 8) break;
    }
    const doiTag = match(block, /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
    let url: string | null = null;
    const linkMatch = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"[^>]*>/);
    if (linkMatch) url = linkMatch[1];
    if (!url && id) url = id.trim();
    entries.push({
      id: (id || "").trim(),
      title,
      authors,
      year: Number.isFinite(year as number) ? year : null,
      url,
      doi: doiTag ? doiTag.trim() : null
    });
  }
  return entries;
}

function match(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1] : null;
}
