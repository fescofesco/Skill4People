import { newEvidenceId } from "./ids";
import { EvidenceCard } from "./schemas";
import { TavilySearchResult } from "./tavily";
import { nowIso, truncate } from "./utils";

export type EvidenceSourceType = EvidenceCard["source_type"];

const SUPPLIER_DOMAINS = [
  "thermofisher.com",
  "sigmaaldrich.com",
  "promega.com",
  "qiagen.com",
  "atcc.org",
  "addgene.org",
  "idtdna.com",
  "millipore.com",
  "merckmillipore.com",
  "abcam.com",
  "bio-rad.com",
  "neb.com",
  "rndsystems.com",
  "dsmz.de",
  "lonza.com"
];

const PROTOCOL_DOMAINS = [
  "protocols.io",
  "bio-protocol.org",
  "jove.com",
  "openwetware.org",
  "nature.com",
  "ncbi.nlm.nih.gov",
  "springernature.com"
];

export function classifySource(url: string): EvidenceSourceType {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (SUPPLIER_DOMAINS.some((d) => host.endsWith(d))) return "supplier_page";
    if (PROTOCOL_DOMAINS.some((d) => host.endsWith(d))) return "protocol";
    if (host.endsWith("nature.com") || host.endsWith("sciencemag.org") || host.endsWith("cell.com")) {
      return "paper";
    }
    if (host.endsWith(".gov") || host.endsWith(".edu")) return "technical_bulletin";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function tavilyToEvidenceCard(r: TavilySearchResult, hint?: EvidenceSourceType): EvidenceCard {
  const sourceType = hint || classifySource(r.url);
  // For fact extraction, prefer raw_content when present (full page text) and
  // fall back to the search snippet. The displayed snippet stays short.
  const factSource = (r.raw_content && r.raw_content.length > 0 ? r.raw_content : r.content) || "";
  const facts = extractFacts(factSource);
  return {
    id: newEvidenceId(),
    title: r.title || hostnameOf(r.url),
    source_name: hostnameOf(r.url),
    source_url: r.url || "not_found",
    source_type: sourceType,
    snippet: truncate((r.content || "").replace(/\s+/g, " "), 600),
    extracted_facts: facts,
    confidence:
      sourceType === "supplier_page" || sourceType === "protocol" || sourceType === "paper"
        ? "medium"
        : "low",
    retrieved_at: nowIso()
  };
}

function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Extract structured supplier/protocol facts from a Tavily snippet:
 *   - catalog numbers (e.g. "Cat. No. C5638", "Product 12345-678", "ab12345")
 *   - prices in USD/EUR/GBP
 *   - concentrations (mg/mL, µM, %)
 *   - pack/quantity sizes (1 mg, 100 µL, 10 vials)
 *   - working temperatures, durations
 * Falls back to numeric-bearing sentences so callers always get something.
 */
function extractFacts(text: string): string[] {
  if (!text) return [];
  // Cap to 16 KB so regex passes stay sub-millisecond even on huge raw_content.
  const trimmed = text.length > 16_000 ? text.slice(0, 16_000) : text;
  const cleaned = trimmed.replace(/\s+/g, " ").trim();
  const found = new Set<string>();
  const out: string[] = [];

  const patterns: { label: string; re: RegExp }[] = [
    { label: "catalog", re: /\b(?:cat(?:alog)?\.?\s*(?:no\.?|number|#)|product\s*(?:no\.?|#)|item\s*#)\s*[:#]?\s*[A-Z0-9][A-Z0-9\-_/]{2,15}\b/gi },
    { label: "catalog", re: /\bab\d{4,7}\b/g }, // Abcam pattern
    { label: "catalog", re: /\b[A-Z]{1,3}\d{4,8}(?:[-A-Z]{1,4})?\b/g }, // Sigma/Thermo style
    { label: "price", re: /(?:USD|US\$|\$|EUR|€|GBP|£)\s?\d{1,5}(?:[.,]\d{2})?(?:\s?(?:per|\/)\s?(?:mg|g|kg|mL|L|µL|ul|µg|ug|unit|kit))?/gi },
    { label: "concentration", re: /\d+(?:\.\d+)?\s?(?:mg|µg|ug|ng|pg|mol|mmol|µmol|umol|nmol|pmol)\s?\/\s?(?:mL|L|µL|ul)/gi },
    { label: "concentration", re: /\d+(?:\.\d+)?\s?(?:%|µM|uM|nM|pM|M)\b/g },
    { label: "pack", re: /\b\d+\s?(?:mg|g|kg|mL|L|µL|ul|vials?|tubes?|tests|reactions|wells)\b/gi },
    { label: "temperature", re: /\b\-?\d{1,3}\s?°\s?C\b/g },
    { label: "duration", re: /\b\d{1,3}\s?(?:min|minutes|hr|hrs|hour|hours|day|days|week|weeks)\b/gi }
  ];

  for (const p of patterns) {
    const matches = cleaned.match(p.re) || [];
    for (const m of matches) {
      const key = `${p.label}:${m.toLowerCase()}`;
      if (found.has(key)) continue;
      found.add(key);
      out.push(`${p.label}: ${m.trim()}`);
      if (out.length >= 6) return out;
    }
  }

  // If we still don't have enough, fall back to numeric sentences.
  if (out.length < 3) {
    const sentences = cleaned.split(/(?<=[.!?])\s+/).slice(0, 8);
    for (const s of sentences) {
      if (/\d/.test(s) && s.length > 20 && s.length < 220) {
        out.push(s.trim());
        if (out.length >= 4) break;
      }
    }
  }
  return out;
}

export function mergeEvidenceCards(...lists: EvidenceCard[][]): EvidenceCard[] {
  const out: EvidenceCard[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const card of list) {
      const key = card.source_url + "::" + card.title;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(card);
    }
  }
  return out.slice(0, 12);
}
