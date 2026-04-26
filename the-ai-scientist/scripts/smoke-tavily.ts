import "./load-env";
import { tavilySearch } from "../lib/tavily";
import { buildSupplierQueries, searchSuppliers } from "../lib/supplier-search";
import { buildProtocolQueries, searchProtocols } from "../lib/protocol-search";
import { searchRegulatory, hypothesisNeedsRegulatorySearch } from "../lib/regulatory-search";
import { ParsedHypothesis } from "../lib/schemas";

const HYPOTHESES: { name: string; hypothesis: string; parsed: ParsedHypothesis }[] = [
  {
    name: "graphene FET biosensor for ctDNA",
    hypothesis:
      "A graphene field-effect transistor functionalized with EGFR-specific aptamers will detect circulating tumor DNA (ctDNA) in plasma at concentrations below 10 fM with a 30-minute time-to-result.",
    parsed: {
      domain: "diagnostics",
      experiment_type: "method development",
      organism_or_system: "human plasma",
      intervention: "graphene field-effect transistor with EGFR aptamer functionalization",
      comparator: "qPCR for circulating tumor DNA",
      primary_outcome: "ctDNA detection limit (fM) and time-to-result (min)",
      quantitative_target: "below 10 fM, 30-minute time-to-result",
      mechanism: "aptamer binding modulates graphene channel conductance",
      implied_controls: ["aptamer-free FET", "scrambled aptamer", "no-template control"],
      key_variables: ["EGFR aptamer concentration", "gate voltage", "plasma dilution factor"],
      key_measurements: ["LoD (fM)", "time-to-result (min)", "specificity"],
      safety_flags: ["human samples"]
    }
  },
  {
    name: "mouse gut microbiome",
    hypothesis:
      "Daily gavage of Lactobacillus rhamnosus GG will reduce intestinal permeability in C57BL/6 mice fed a high-fat diet.",
    parsed: {
      domain: "microbiology",
      experiment_type: "in vivo intervention",
      organism_or_system: "C57BL/6 mice",
      intervention: "Lactobacillus rhamnosus GG oral gavage",
      comparator: "vehicle gavage",
      primary_outcome: "FITC-dextran intestinal permeability",
      quantitative_target: "≥30% reduction vs vehicle",
      mechanism: "LGG-induced tight-junction protein upregulation",
      implied_controls: ["sham gavage", "standard chow group"],
      key_variables: ["high-fat diet duration", "probiotic dose", "gavage frequency"],
      key_measurements: ["FITC-dextran serum", "claudin-1 expression", "ZO-1 expression"],
      safety_flags: ["animal work"]
    }
  }
];

async function main() {
  const ping = await tavilySearch("Sigma Aldrich anti-CRP antibody catalog number", {
    maxResults: 3
  });
  console.log("=== tavilyPing ===");
  console.log({
    configured: !!ping,
    hits: ping?.results.length ?? 0,
    firstUrl: ping?.results?.[0]?.url ?? null
  });

  for (const h of HYPOTHESES) {
    console.log(`\n=== ${h.name} ===`);
    const supplierQueries = buildSupplierQueries(h.parsed, h.hypothesis);
    const protocolQueries = buildProtocolQueries(h.parsed, h.hypothesis);
    console.log("supplierQueries:", supplierQueries);
    console.log("protocolQueries:", protocolQueries);

    const reg = hypothesisNeedsRegulatorySearch(h.hypothesis, h.parsed);
    console.log("regulatoryFlags:", reg);

    const startedAt = Date.now();
    const [suppliers, protocols, regulatory] = await Promise.all([
      searchSuppliers(h.hypothesis, h.parsed),
      searchProtocols(h.hypothesis, h.parsed),
      searchRegulatory(h.hypothesis, h.parsed)
    ]);
    console.log({
      suppliers: suppliers.length,
      protocols: protocols.length,
      regulatory: regulatory.cards.length,
      regulatoryReasons: regulatory.reasons,
      durationMs: Date.now() - startedAt
    });

    if (suppliers.length) {
      console.log("supplier sample:", {
        title: suppliers[0].title,
        url: suppliers[0].source_url,
        facts: suppliers[0].extracted_facts.slice(0, 6)
      });
    }
    if (protocols.length) {
      console.log("protocol sample:", {
        title: protocols[0].title,
        url: protocols[0].source_url
      });
    }
    if (regulatory.cards.length) {
      console.log("regulatory sample:", {
        title: regulatory.cards[0].title,
        url: regulatory.cards[0].source_url
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
