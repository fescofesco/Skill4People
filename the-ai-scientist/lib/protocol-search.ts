import { getEnv } from "./env";
import { EvidenceCard, ParsedHypothesis } from "./schemas";
import { tavilyMultiSearch } from "./tavily";
import { tavilyToEvidenceCard } from "./evidence";

const PROTOCOL_DOMAINS = [
  "protocols.io",
  "bio-protocol.org",
  "jove.com",
  "openwetware.org",
  "nature.com",
  "springernature.com",
  "wiley.com",
  "elifesciences.org",
  "biorxiv.org",
  "medrxiv.org",
  "ncbi.nlm.nih.gov",
  "frontiersin.org",
  "plos.org",
  "ieee.org",
  "acs.org",
  "rsc.org"
];

const STOP = new Set([
  "the","a","an","and","or","of","in","on","for","to","with","by","into","from","over",
  "is","are","was","were","be","being","been","this","that","these","those","than","then",
  "as","at","its","it","we","our","their","such","using","based","via","per","across"
]);

function phrases(text: string | undefined | null, n = 3): string[] {
  if (!text) return [];
  const tokens = text
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}":;,\.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...bigrams, ...tokens]) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Universal protocol query builder. Combines salient phrases from
 * intervention/system/outcome with method-oriented vocabulary so Tavily
 * prefers protocols.io / bio-protocol / JoVE pages.
 */
export function buildProtocolQueries(parsed: ParsedHypothesis, _hypothesis: string): string[] {
  const intv = phrases(parsed.intervention, 3);
  const sys = phrases(parsed.organism_or_system, 2);
  const outc = phrases(parsed.primary_outcome, 2);
  const expType = parsed.experiment_type ? phrases(parsed.experiment_type, 1)[0] : null;

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (q: string) => {
    const k = q.toLowerCase().trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(q);
  };

  // High-leverage queries: intervention + outcome + "protocol" so Tavily
  // surfaces methods pages even when the hypothesis is unusual.
  for (const i of intv) {
    if (outc[0]) push(`${i} ${outc[0]} protocol method`);
    push(`${i} step by step protocol`);
  }
  for (const s of sys) {
    if (intv[0]) push(`${s} ${intv[0]} method`);
    push(`${s} sample preparation protocol`);
  }
  if (expType) push(`${expType} validation protocol`);

  return out.slice(0, 5);
}

export async function searchProtocols(
  hypothesis: string,
  parsed: ParsedHypothesis
): Promise<EvidenceCard[]> {
  const env = getEnv();
  if (!env.tavilyApiKey) return [];
  const queries = buildProtocolQueries(parsed, hypothesis);
  if (queries.length === 0) return [];
  const results = await tavilyMultiSearch(queries, {
    maxResults: 4,
    includeDomains: PROTOCOL_DOMAINS,
    searchDepth: "basic"
  });
  return results.map((r) => tavilyToEvidenceCard(r, "protocol")).slice(0, 8);
}
