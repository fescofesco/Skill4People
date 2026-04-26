import { getEnv } from "./env";
import { EvidenceCard, ParsedHypothesis } from "./schemas";
import { tavilyMultiSearch } from "./tavily";
import { tavilyToEvidenceCard } from "./evidence";

/**
 * Regulatory / safety / oversight resources. Tavily is anchored to these
 * domains when the hypothesis touches human samples, animal work, GMOs,
 * pathogens, or regulated reagents.
 */
const REGULATORY_DOMAINS = [
  "fda.gov",
  "cdc.gov",
  "nih.gov",
  "ncbi.nlm.nih.gov",
  "who.int",
  "ec.europa.eu",
  "ema.europa.eu",
  "hhs.gov",
  "osha.gov",
  "epa.gov",
  "iso.org",
  "asnzs.com.au",
  "selectagents.gov",
  "absa.org",
  "biosafety.org",
  "irb.research.northwestern.edu",
  "irb.harvard.edu",
  "iacuc.org",
  "research.uiowa.edu",
  "icmje.org"
];

/**
 * Detect whether the hypothesis or parsed fields indicate the experiment
 * needs regulatory evidence (IRB / IACUC / IBC / biosafety / select agents).
 */
export function hypothesisNeedsRegulatorySearch(
  hypothesis: string,
  parsed: ParsedHypothesis
): { needs: boolean; reasons: string[] } {
  const lowered = (
    hypothesis +
    " " +
    parsed.organism_or_system +
    " " +
    (parsed.intervention || "") +
    " " +
    (parsed.safety_flags || []).join(" ")
  ).toLowerCase();

  const reasons: string[] = [];
  // All patterns use \b word boundaries so substrings (e.g. "rat" inside
  // "concent**rat**ions") do not produce false positives.
  const checks: { re: RegExp; reason: string }[] = [
    {
      re: /\b(human\s+(?:subject|sample|sera|serum|plasma|blood|tissue|cell|donor)s?|human-?derived|patient|clinical\s+trial|saliva|tissue\s+donor|biopsy|psychological|informed\s+consent)\b/,
      reason: "human subjects / human-derived samples (IRB)"
    },
    {
      re: /\b(mouse|mice|rat|rats|rodent|zebrafish|primate|monkey|pig|swine|sheep|cow|bovine|in\s+vivo|c57bl|sprague|wistar|balb|animal\s+model|vertebrate)\b/,
      reason: "animal work (IACUC)"
    },
    {
      re: /\b(gmo|genetically\s+modified|recombinant\s+dna|crispr(?:[- ]cas9?)?|gene\s+drive|transgenic|knockout|knock[- ]?in|lentivir(?:al|us)|aav|adeno-?associated)\b/,
      reason: "recombinant DNA / GMO (IBC)"
    },
    {
      re: /\b(pathogen|sars[- ]?cov[- ]?2?|influenza|tuberculosis|m\.?\s*tuberculosis|select\s+agent|botulinum|ricin|biosafety\s+level|bsl[- ]?[234])\b/,
      reason: "pathogen / select agent (BSL / Select Agents)"
    },
    {
      re: /\b(radioisotope|radioactive|[psi]-\d{1,3}|h-3|tritium|gamma\s+source)\b/,
      reason: "radioisotope handling (RAM permit)"
    },
    {
      re: /\b(human\s+embryonic\s+stem|hesc|ipsc|escro|scro)\b/,
      reason: "human stem cell (ESCRO/SCRO)"
    },
    {
      re: /\b(pii|hipaa|phi|protected\s+health|gdpr|de-?identification)\b/,
      reason: "patient data privacy (HIPAA/GDPR)"
    }
  ];
  for (const c of checks) {
    if (c.re.test(lowered)) reasons.push(c.reason);
  }
  return { needs: reasons.length > 0, reasons };
}

export function buildRegulatoryQueries(reasons: string[]): string[] {
  const out: string[] = [];
  if (reasons.some((r) => r.startsWith("human"))) {
    out.push("IRB human subjects research protocol requirements");
    out.push("informed consent template human samples research");
  }
  if (reasons.some((r) => r.startsWith("animal"))) {
    out.push("IACUC protocol approval rodent welfare guidelines");
    out.push("3Rs replacement reduction refinement animal research");
  }
  if (reasons.some((r) => r.startsWith("recombinant"))) {
    out.push("NIH guidelines recombinant DNA Institutional Biosafety Committee IBC");
  }
  if (reasons.some((r) => r.startsWith("pathogen"))) {
    out.push("CDC select agents biosafety level laboratory requirements");
    out.push("BMBL biosafety in microbiological and biomedical laboratories");
  }
  if (reasons.some((r) => r.startsWith("radioisotope"))) {
    out.push("radiation safety committee radioactive material permit research");
  }
  if (reasons.some((r) => r.startsWith("human stem cell"))) {
    out.push("ESCRO embryonic stem cell research oversight committee");
  }
  if (reasons.some((r) => r.includes("HIPAA") || r.includes("GDPR"))) {
    out.push("HIPAA research data de-identification requirements");
    out.push("GDPR processing health data research consent");
  }
  return out.slice(0, 5);
}

/**
 * Search for regulatory/oversight evidence. Returns empty if hypothesis
 * does not trigger any safety category, or if Tavily is not configured.
 */
export async function searchRegulatory(
  hypothesis: string,
  parsed: ParsedHypothesis
): Promise<{ cards: EvidenceCard[]; reasons: string[] }> {
  const env = getEnv();
  const trigger = hypothesisNeedsRegulatorySearch(hypothesis, parsed);
  if (!trigger.needs || !env.tavilyApiKey) {
    return { cards: [], reasons: trigger.reasons };
  }
  const queries = buildRegulatoryQueries(trigger.reasons);
  if (queries.length === 0) return { cards: [], reasons: trigger.reasons };
  const results = await tavilyMultiSearch(queries, {
    maxResults: 3,
    includeDomains: REGULATORY_DOMAINS,
    searchDepth: "basic"
  });
  const cards = results.map((r) => tavilyToEvidenceCard(r, "technical_bulletin")).slice(0, 6);
  return { cards, reasons: trigger.reasons };
}
