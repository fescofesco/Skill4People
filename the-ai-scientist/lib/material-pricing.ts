import { getEnv } from "./env";
import { tavilyToEvidenceCard } from "./evidence";
import { chatCompletionsJson, getOpenAIClient } from "./openai";
import { EvidenceCard, Material } from "./schemas";
import { tavilyMultiSearch } from "./tavily";

/**
 * Stable string marker embedded in `notes` so the UI can render an "approx"
 * badge for AI-estimated prices that aren't backed by a vendor quote. Kept
 * as a single token so a simple `.includes()` check is enough on the client.
 */
export const APPROX_NOTE_MARKER = "[approx_estimate]";

const SUPPLIER_DOMAINS = [
  "thermofisher.com",
  "sigmaaldrich.com",
  "fishersci.com",
  "millipore.com",
  "merckmillipore.com",
  "abcam.com",
  "promega.com",
  "qiagen.com",
  "atcc.org",
  "neb.com",
  "rndsystems.com",
  "lonza.com",
  "vwr.com",
  "bio-rad.com",
  "biorad.com",
  "idtdna.com",
  "addgene.org"
];

/**
 * Per-material targeted Tavily query for materials that didn't match in the
 * initial supplier search. Bounded to avoid burning Tavily credits on huge
 * material lists; in practice plans rarely exceed 6-8 materials anyway.
 */
export async function searchSuppliersForMaterials(
  materials: Material[],
  maxQueries = 6
): Promise<EvidenceCard[]> {
  const env = getEnv();
  if (!env.tavilyApiKey || materials.length === 0) return [];
  const queries = materials
    .slice(0, maxQueries)
    .map((m) => `${m.name} catalog number price Sigma Aldrich Thermo Fisher`);
  if (queries.length === 0) return [];
  try {
    const results = await tavilyMultiSearch(queries, {
      maxResults: 3,
      includeDomains: SUPPLIER_DOMAINS,
      // Advanced + raw content lets the evidence extractor pull catalog
      // numbers and prices out of vendor product pages.
      searchDepth: "advanced",
      includeRawContent: true
    });
    return results.map((r) => tavilyToEvidenceCard(r, "supplier_page")).slice(0, 12);
  } catch {
    return [];
  }
}

export type AiPriceEstimate = {
  price: number;
  range: string;
  rationale: string;
};

/**
 * Ask the LLM for typical USD list prices for any materials still without
 * a vendor-derived cost. The prompt forces "omit if unsure", so we never
 * fabricate a number for an esoteric reagent.
 */
export async function estimatePricesAI(
  materials: Material[]
): Promise<Map<string, AiPriceEstimate>> {
  const out = new Map<string, AiPriceEstimate>();
  const client = getOpenAIClient();
  if (!client) return out;
  const targets = materials.filter((m) => m.unit_cost === null);
  if (targets.length === 0) return out;

  const system = `You estimate typical US-list prices a research lab would pay for laboratory reagents and consumables.

Return strict JSON:
{
  "estimates": [
    {
      "id": "<material id>",
      "price_usd": <number>,
      "price_range": "$<low>-$<high>",
      "rationale": "<one short sentence: pack size + typical vendor>"
    }
  ]
}

Rules:
- Use median list prices from Sigma-Aldrich, Thermo Fisher, Fisher Scientific, VWR, Millipore-Sigma.
- Prices are PER PACK at the indicated pack size. If pack size is missing, assume the smallest research-scale pack.
- If you do not have reasonable confidence in a price, OMIT that material entirely. Do NOT guess.
- Typical range: $5-$500. Antibodies, kits, and instruments can exceed $1000.
- Never include any material whose name you don't recognize as a real product.`;

  const user = JSON.stringify(
    {
      materials: targets.map((m) => ({
        id: m.id,
        name: m.name,
        purpose: m.purpose,
        pack_size: m.pack_size || null,
        quantity_needed: m.quantity_needed || null
      }))
    },
    null,
    2
  );

  try {
    const raw = await chatCompletionsJson({
      system,
      user,
      temperature: 0.1,
      maxTokens: 700
    });
    const parsed = raw as { estimates?: unknown };
    const list = Array.isArray(parsed.estimates) ? parsed.estimates : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const id = typeof it.id === "string" ? it.id : null;
      const price = typeof it.price_usd === "number" ? it.price_usd : null;
      if (!id || price === null || !Number.isFinite(price) || price <= 0) continue;
      const range = typeof it.price_range === "string" ? it.price_range : `~$${Math.round(price)}`;
      const rationale =
        typeof it.rationale === "string" ? it.rationale : "Typical list price for this reagent.";
      out.set(id, {
        price: Math.round(price * 100) / 100,
        range,
        rationale
      });
    }
  } catch {
    // Quota / network / policy errors — fall back silently. The UI will show
    // "—" for these materials, which is the existing behaviour.
  }
  return out;
}

/**
 * Apply AI estimates to materials, marking them as approximations. Never
 * overwrites a real (vendor-evidence-derived) price.
 */
export function applyApproxEstimates(
  materials: Material[],
  estimates: Map<string, AiPriceEstimate>
): Material[] {
  if (estimates.size === 0) return materials;
  return materials.map((m) => {
    if (m.unit_cost !== null) return m;
    const est = estimates.get(m.id);
    if (!est) return m;
    const note = `${APPROX_NOTE_MARKER} ~${est.range} — ${est.rationale} Verify with a real vendor quote before ordering.`;
    return {
      ...m,
      unit_cost: est.price,
      estimated_cost: est.price,
      // Approximations are explicitly low-confidence so the existing
      // confidence badge in the UI already conveys "unverified".
      confidence: "low" as const,
      notes: [m.notes, note].filter(Boolean).join(" ")
    };
  });
}

/** UI-friendly check: is this material's price an AI approximation? */
export function isApproximatePrice(m: Pick<Material, "notes">): boolean {
  return typeof m.notes === "string" && m.notes.includes(APPROX_NOTE_MARKER);
}
