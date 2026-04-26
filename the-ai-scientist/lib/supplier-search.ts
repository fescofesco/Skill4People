import { getEnv } from "./env";
import { chatCompletionsJson, getOpenAIClient, getOpenAIModel } from "./openai";
import { EvidenceCard, ParsedHypothesis } from "./schemas";
import { tavilyMultiSearch } from "./tavily";
import { tavilyToEvidenceCard } from "./evidence";

/**
 * Vendors, repositories, and biospecimen registries we want Tavily to prefer
 * when searching for materials/reagents/equipment. These are passed as
 * include_domains so Tavily limits results to product/catalog pages.
 */
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
  "lonza.com",
  "fishersci.com",
  "vwr.com",
  "vlab.io",
  "biotechrabbit.com",
  "biorad.com",
  "biocompare.com",
  "labx.com",
  "newark.com",
  "mouser.com",
  "digikey.com",
  "thorlabs.com",
  "edmundoptics.com",
  "ossila.com"
];

/** Lightweight stop-words list used to extract "salient terms" from parsed fields. */
const STOP = new Set([
  "the","a","an","and","or","of","in","on","for","to","with","by","into","from","over",
  "is","are","was","were","be","being","been","this","that","these","those","than","then",
  "as","at","its","it","we","our","their","such","using","based","at","via","per","across",
  "study","experiment","analysis","approach","method","detect","detection","measure",
  "compared","comparison","control","controls","without","appropriate","baseline","reference"
]);

/** Pull 1-3 word salient phrases from a parsed-hypothesis field. */
function salientTerms(text: string | undefined | null, limit = 4): string[] {
  if (!text) return [];
  const cleaned = text
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}":;,\.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const tokens = cleaned.split(" ").filter((w) => w.length > 2 && !STOP.has(w));
  // bigrams that look like compound nouns (rough heuristic): consecutive non-stop tokens
  const bigrams: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  // unigrams as fallback
  const seen = new Set<string>();
  const out: string[] = [];
  for (const phrase of [...bigrams, ...tokens]) {
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Build supplier queries for ANY hypothesis by composing salient terms from
 * intervention / organism_or_system / key_variables with catalog vocabulary.
 * No topic switch, no hard-coded products — purely derived from parsed fields.
 */
export function buildSupplierQueries(parsed: ParsedHypothesis, _hypothesis: string): string[] {
  const interventionTerms = salientTerms(parsed.intervention, 3);
  const systemTerms = salientTerms(parsed.organism_or_system, 2);
  const variableTerms = (parsed.key_variables || [])
    .flatMap((v) => salientTerms(v, 1))
    .slice(0, 4);

  const seen = new Set<string>();
  const queries: string[] = [];
  const push = (q: string) => {
    const k = q.toLowerCase().trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    queries.push(q);
  };

  // Catalog/price-oriented queries on the most specific terms
  for (const term of interventionTerms) push(`${term} catalog number price supplier`);
  for (const term of systemTerms) push(`${term} reagent catalog`);
  for (const term of variableTerms.slice(0, 3)) push(`${term} catalog antibody reagent`);

  // Brand-anchored fallbacks so Tavily's supplier-domain filter actually returns hits.
  if (interventionTerms[0]) {
    push(`Sigma Aldrich ${interventionTerms[0]} catalog`);
    push(`Thermo Fisher ${interventionTerms[0]} catalog`);
  }

  return queries.slice(0, 5);
}

const REFINE_SYSTEM = `You translate experimental hypothesis fields into supplier-searchable product queries for Sigma-Aldrich, Thermo Fisher, Abcam, Fisher Scientific, ATCC, etc.

Return strict JSON:
{ "queries": ["query 1", "query 2", ...] }

Rules:
- 3 to 6 queries, each 3-12 words.
- Each query MUST name a concrete product type a vendor would list (antibody, kit, reagent, electrode, cell line, primer, plasmid, instrument).
- Prefer ONE specific product per query. Append "catalog number" or "price" to one or two queries.
- Do not invent specific catalog IDs.
- Skip generic phrases like "appropriate control material".`;

async function aiRefineSupplierQueries(
  parsed: ParsedHypothesis,
  hypothesis: string
): Promise<string[] | null> {
  const env = getEnv();
  if (!env.openaiApiKey || !getOpenAIClient()) return null;
  try {
    const raw = await chatCompletionsJson({
      system: REFINE_SYSTEM,
      user: [
        "Hypothesis:",
        hypothesis,
        "",
        "Parsed:",
        JSON.stringify(
          {
            domain: parsed.domain,
            experiment_type: parsed.experiment_type,
            organism_or_system: parsed.organism_or_system,
            intervention: parsed.intervention,
            comparator: parsed.comparator,
            primary_outcome: parsed.primary_outcome,
            key_variables: parsed.key_variables,
            key_measurements: parsed.key_measurements
          },
          null,
          2
        )
      ].join("\n"),
      temperature: 0.2,
      maxTokens: 350,
      model: getOpenAIModel()
    });
    const parsedJson = raw as { queries?: unknown };
    const queries = Array.isArray(parsedJson.queries) ? parsedJson.queries : [];
    const cleaned = queries
      .filter((q): q is string => typeof q === "string")
      .map((q) => q.trim())
      .filter((q) => q.length >= 6 && q.length <= 140)
      .slice(0, 6);
    return cleaned.length ? cleaned : null;
  } catch {
    return null;
  }
}

export async function searchSuppliers(
  hypothesis: string,
  parsed: ParsedHypothesis
): Promise<EvidenceCard[]> {
  const env = getEnv();
  if (!env.tavilyApiKey) return [];
  // Try OpenAI-refined queries first; fall back to heuristic ones on any failure
  // (no API key, 429, etc.). The fallback path is what shipped before, so any
  // regression is caught by `npm run smoke:tavily`.
  const aiQueries = await aiRefineSupplierQueries(parsed, hypothesis);
  const queries = aiQueries && aiQueries.length ? aiQueries : buildSupplierQueries(parsed, hypothesis);
  if (queries.length === 0) return [];
  const results = await tavilyMultiSearch(queries, {
    maxResults: 4,
    includeDomains: SUPPLIER_DOMAINS,
    // Advanced + raw content lets us extract real catalog numbers and prices
    // from product pages (worth the extra Tavily credits for the budget step).
    searchDepth: "advanced",
    includeRawContent: true
  });
  return results.map((r) => tavilyToEvidenceCard(r, "supplier_page")).slice(0, 8);
}
