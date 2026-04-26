import { EvidenceCard, Material } from "./schemas";

const STOP = new Set([
  "the","a","an","and","or","of","in","on","for","to","with","by","into","from","over",
  "is","are","was","were","be","being","been","this","that","these","those","than","then",
  "as","at","its","it","we","our","their","such","using","based","via","per","across",
  "control","controls","material","materials","reagent","reagents","kit","kits","item",
  "appropriate","baseline","negative","reference","measurement","assay","candidate","required"
]);

function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}":;,\.!?\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Token overlap (size of intersection) between two phrases. */
function overlapScore(a: string, b: string): number {
  const A = new Set(tokenize(a));
  if (!A.size) return 0;
  let s = 0;
  for (const t of tokenize(b)) if (A.has(t)) s++;
  return s;
}

/**
 * Parse a Tavily-extracted price string into a USD number.
 * Handles "$120.50", "USD 120", "EUR 95,00", "£75 per kit" — converts EUR/GBP
 * to USD with conservative static rates so the budget remains directional.
 */
export function parsePriceUSD(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const match = s.match(/(usd|us\$|\$|eur|€|gbp|£)\s?(\d{1,5}(?:[.,]\d{1,2})?)/);
  if (!match) return null;
  const currency = match[1];
  const numericRaw = match[2].replace(/,/g, ".");
  const num = parseFloat(numericRaw);
  if (!Number.isFinite(num)) return null;
  // Conservative static FX so we never invent precision; the UI labels these
  // as "evidence-derived" and prompts the user to confirm.
  if (currency === "eur" || currency === "€") return Math.round(num * 1.07 * 100) / 100;
  if (currency === "gbp" || currency === "£") return Math.round(num * 1.27 * 100) / 100;
  return num;
}

/** Pull a fact value by label prefix (e.g. "catalog: C5638"). */
function pickFact(facts: string[], label: string): string | null {
  const prefix = `${label}: `;
  const hit = facts.find((f) => f.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

export type MaterialEnrichmentResult = {
  materials: Material[];
  matched: number;
  withPrice: number;
};

/**
 * For each material, pick the best matching supplier evidence card by token
 * overlap and copy supplier name, catalog number, source URL, and price into
 * the Material. Heuristic only — never invents data.
 */
export function enrichMaterialsFromEvidence(
  materials: Material[],
  evidenceCards: EvidenceCard[],
  minOverlap = 2
): MaterialEnrichmentResult {
  const supplierCards = evidenceCards.filter((c) => c.source_type === "supplier_page");
  if (supplierCards.length === 0) {
    return { materials, matched: 0, withPrice: 0 };
  }
  let matched = 0;
  let withPrice = 0;

  const out = materials.map((m) => {
    const haystack = [m.name, m.purpose, m.notes].filter(Boolean).join(" ");
    let best: { card: EvidenceCard; score: number } | null = null;
    for (const card of supplierCards) {
      const score = overlapScore(haystack, `${card.title} ${card.snippet}`);
      if (score < minOverlap) continue;
      if (!best || score > best.score) best = { card, score };
    }
    if (!best) return m;
    matched++;

    const catalog = pickFact(best.card.extracted_facts, "catalog");
    const priceRaw = pickFact(best.card.extracted_facts, "price");
    const price = parsePriceUSD(priceRaw);
    if (price !== null) withPrice++;

    return {
      ...m,
      supplier: best.card.source_name && best.card.source_name !== "unknown"
        ? best.card.source_name
        : m.supplier,
      catalog_number: catalog ?? m.catalog_number,
      source_url: best.card.source_url || m.source_url,
      unit_cost: price ?? m.unit_cost,
      estimated_cost: price ?? m.estimated_cost,
      confidence: price !== null ? "medium" : catalog ? "medium" : m.confidence,
      notes: [
        m.notes,
        `Matched live supplier evidence: ${best.card.title}.`,
        priceRaw ? `Live price text: ${priceRaw}.` : null,
        "Verify catalog and pricing before ordering."
      ]
        .filter(Boolean)
        .join(" ")
    } as Material;
  });

  return { materials: out, matched, withPrice };
}
