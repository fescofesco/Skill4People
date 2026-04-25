import { detectDemoTopic } from "./demo-fallbacks";
import { getEnv } from "./env";
import { EvidenceCard, ParsedHypothesis } from "./schemas";
import { tavilyMultiSearch } from "./tavily";
import { tavilyToEvidenceCard } from "./evidence";

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

export function buildSupplierQueries(parsed: ParsedHypothesis, hypothesis: string): string[] {
  const topic = detectDemoTopic(hypothesis);
  const queries: string[] = [];
  switch (topic) {
    case "diagnostics":
      queries.push(
        "Sigma anti-CRP antibody catalog number",
        "Thermo Fisher CRP ELISA kit catalog",
        "screen-printed carbon electrode catalog"
      );
      break;
    case "gut_health":
      queries.push(
        "Sigma FITC-dextran 4 kDa catalog number",
        "ATCC Lactobacillus rhamnosus GG catalog",
        "Abcam claudin-1 occludin antibody catalog"
      );
      break;
    case "cell_biology":
      queries.push(
        "ATCC HeLa cells handling cryopreservation",
        "Sigma trehalose dihydrate molecular biology grade catalog",
        "Sigma DMSO Hybri-Max cryoprotectant catalog"
      );
      break;
    case "climate":
      queries.push(
        "DSMZ Sporomusa ovata strain catalog",
        "Sigma sodium bicarbonate anaerobic culture catalog",
        "graphite felt electrode bioelectrochemical reactor catalog"
      );
      break;
    default: {
      const baseTerms = [parsed.intervention, parsed.organism_or_system].filter(Boolean).join(" ");
      if (baseTerms) queries.push(`${baseTerms} catalog supplier`);
      break;
    }
  }
  return queries.slice(0, 4);
}

export async function searchSuppliers(
  hypothesis: string,
  parsed: ParsedHypothesis
): Promise<EvidenceCard[]> {
  const env = getEnv();
  if (!env.tavilyApiKey) return [];
  const queries = buildSupplierQueries(parsed, hypothesis);
  const results = await tavilyMultiSearch(queries, {
    maxResults: 4,
    includeDomains: SUPPLIER_DOMAINS
  });
  return results.map((r) => tavilyToEvidenceCard(r, "supplier_page")).slice(0, 8);
}
