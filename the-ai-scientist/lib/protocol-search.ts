import { detectDemoTopic, demoEvidenceCards } from "./demo-fallbacks";
import { getEnv } from "./env";
import { EvidenceCard, ParsedHypothesis } from "./schemas";
import { tavilyMultiSearch } from "./tavily";
import { tavilyToEvidenceCard } from "./evidence";

const PROTOCOL_DOMAINS = [
  "protocols.io",
  "bio-protocol.org",
  "jove.com",
  "openwetware.org",
  "nature.com"
];

export function buildProtocolQueries(parsed: ParsedHypothesis, hypothesis: string): string[] {
  const topic = detectDemoTopic(hypothesis);
  const baseTerms: string[] = [parsed.intervention, parsed.organism_or_system, parsed.primary_outcome]
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, " ").trim());

  const topical: string[] = [];
  switch (topic) {
    case "diagnostics":
      topical.push(
        "paper electrochemical biosensor anti-CRP antibody immobilization",
        "whole blood biosensor matrix effect ELISA comparison",
        "screen-printed electrode anti-CRP calibration"
      );
      break;
    case "gut_health":
      topical.push(
        "FITC-dextran intestinal permeability assay protocol",
        "C57BL/6 mouse probiotic supplementation Lactobacillus",
        "claudin-1 occludin western blot qPCR mouse intestine"
      );
      break;
    case "cell_biology":
      topical.push(
        "HeLa cryopreservation DMSO trehalose post-thaw viability",
        "controlled-rate freezing protocol mammalian cells",
        "trypan blue post-thaw viability HeLa"
      );
      break;
    case "climate":
      topical.push(
        "Sporomusa ovata bioelectrochemical reactor acetate protocol",
        "microbial electrosynthesis cathode SHE acetate quantification HPLC",
        "anaerobic culture electrosynthesis biofilm"
      );
      break;
    default:
      break;
  }

  const queries: string[] = [];
  for (const t of topical) queries.push(t);
  if (baseTerms.length) queries.push(baseTerms.join(" "));

  // dedupe & cap
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const k = q.toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(q);
  }
  return out.slice(0, 4);
}

export async function searchProtocols(
  hypothesis: string,
  parsed: ParsedHypothesis
): Promise<EvidenceCard[]> {
  const env = getEnv();
  if (!env.tavilyApiKey) {
    if (env.demoFallbackEnabled) return demoEvidenceCards(detectDemoTopic(hypothesis));
    return [];
  }
  const queries = buildProtocolQueries(parsed, hypothesis);
  const results = await tavilyMultiSearch(queries, {
    maxResults: 4,
    includeDomains: PROTOCOL_DOMAINS
  });
  if (results.length === 0 && env.demoFallbackEnabled) {
    return demoEvidenceCards(detectDemoTopic(hypothesis));
  }
  return results.map((r) => tavilyToEvidenceCard(r, "protocol")).slice(0, 8);
}
