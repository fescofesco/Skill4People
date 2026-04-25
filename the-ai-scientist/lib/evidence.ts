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
  const facts = extractFacts(r.content || "");
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

function extractFacts(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).slice(0, 8);
  for (const s of sentences) {
    if (/\d/.test(s) && s.length < 220 && s.length > 20) {
      out.push(s.trim());
      if (out.length >= 4) break;
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
