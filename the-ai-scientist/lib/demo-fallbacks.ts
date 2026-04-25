import { newReferenceId } from "./ids";
import {
  EvidenceCard,
  LiteratureQC,
  ParsedHypothesis,
  Reference
} from "./schemas";
import { nowIso } from "./utils";

export type DemoTopic = "diagnostics" | "gut_health" | "cell_biology" | "climate" | "generic";

export function detectDemoTopic(text: string): DemoTopic {
  const t = text.toLowerCase();
  if (/(crp|c-?reactive protein|biosensor|whole blood|paper-based|electrochemical biosensor|elisa)/.test(t)) {
    return "diagnostics";
  }
  if (/(lactobacillus|c57bl|fitc-?dextran|claudin|occludin|gut|tight junction|probiotic|microbio)/.test(t)) {
    return "gut_health";
  }
  if (/(hela|trehalose|cryoprotect|dmso|sucrose|cell line|mycoplasma|cryopreserv)/.test(t)) {
    return "cell_biology";
  }
  if (/(sporomusa|bioelectrochemical|cathode|she|acetate|co2 fix|carbon capture|biocatalytic)/.test(t)) {
    return "climate";
  }
  return "generic";
}

export function demoParsedHypothesis(topic: DemoTopic, raw: string): ParsedHypothesis {
  switch (topic) {
    case "diagnostics":
      return {
        domain: "diagnostics",
        experiment_type: "biosensor development and validation",
        organism_or_system: "human whole blood; paper-based electrochemical biosensor",
        intervention: "anti-CRP antibody-functionalized paper-based electrochemical biosensor",
        comparator: "laboratory ELISA reference assay",
        primary_outcome: "C-reactive protein concentration measurement (mg/L)",
        quantitative_target: "LOD < 0.5 mg/L within 10 minutes; ELISA-equivalent sensitivity",
        mechanism:
          "anti-CRP antibody capture on functionalized paper electrode with electrochemical readout signal proportional to bound CRP",
        implied_controls: [
          "blank (no analyte) signal",
          "non-specific antibody control",
          "CRP standard calibration curve",
          "matrix spike recovery",
          "ELISA cross-comparison"
        ],
        key_variables: [
          "antibody immobilization density",
          "blocking strategy",
          "incubation time",
          "whole-blood matrix effects",
          "electrochemical readout method"
        ],
        key_measurements: [
          "limit of detection (LOD)",
          "linear range",
          "intra/inter-assay CV",
          "matrix recovery %",
          "ELISA correlation"
        ],
        safety_flags: [
          "human whole blood handling",
          "biohazard / BSL-2 sharps",
          "blood-borne pathogens",
          "informed consent / IRB for blood collection",
          "clinical claim disclaimer"
        ]
      };
    case "gut_health":
      return {
        domain: "gut health",
        experiment_type: "in vivo mouse probiotic supplementation study",
        organism_or_system: "C57BL/6 mice",
        intervention: "Lactobacillus rhamnosus GG oral supplementation for 4 weeks",
        comparator: "vehicle/placebo control mice",
        primary_outcome: "intestinal permeability measured by FITC-dextran assay",
        quantitative_target: "≥ 30% reduction in serum FITC-dextran vs control",
        mechanism: "upregulation of tight junction proteins claudin-1 and occludin",
        implied_controls: [
          "vehicle/placebo control",
          "baseline pre-treatment measurement",
          "untreated cohort",
          "assay standard curve"
        ],
        key_variables: [
          "probiotic dose / CFU",
          "viability of supplement",
          "cage assignment",
          "diet",
          "age and sex of mice"
        ],
        key_measurements: [
          "serum FITC-dextran concentration",
          "claudin-1 and occludin expression (qPCR / WB)",
          "body weight",
          "fecal microbiome composition"
        ],
        safety_flags: [
          "animal work (IACUC approval required)",
          "live microbial supplement",
          "humane endpoints",
          "biohazardous waste"
        ]
      };
    case "cell_biology":
      return {
        domain: "cell biology",
        experiment_type: "cryopreservation comparison study",
        organism_or_system: "HeLa human cervical cancer cell line",
        intervention: "trehalose-based cryoprotectant freezing medium",
        comparator: "standard DMSO cryoprotectant; sucrose-based comparator",
        primary_outcome: "post-thaw cell viability",
        quantitative_target: "≥ 15 percentage point increase vs DMSO standard",
        mechanism: "trehalose membrane stabilization at low temperatures",
        implied_controls: [
          "standard DMSO protocol control",
          "sucrose comparator",
          "untreated/fresh cells",
          "dead-cell control for assay"
        ],
        key_variables: [
          "cryoprotectant concentration",
          "cooling rate",
          "thawing rate",
          "post-thaw recovery time",
          "passage number"
        ],
        key_measurements: [
          "post-thaw viability (trypan blue / 7-AAD / live-dead)",
          "recovery / proliferation rate",
          "morphology",
          "mycoplasma status"
        ],
        safety_flags: [
          "human-derived cell line (BSL-2)",
          "liquid nitrogen / cryogenic hazards",
          "DMSO handling",
          "cell line authentication required"
        ]
      };
    case "climate":
      return {
        domain: "climate",
        experiment_type: "bioelectrochemical CO2 fixation",
        organism_or_system: "Sporomusa ovata in bioelectrochemical reactor",
        intervention: "cathodic biofilm at -400 mV vs SHE for CO2-to-acetate conversion",
        comparator: "current biocatalytic carbon capture benchmarks; abiotic and open-circuit controls",
        primary_outcome: "acetate production rate (mmol/L/day)",
        quantitative_target: "≥ 150 mmol/L/day; ≥ 20% improvement over benchmarks",
        mechanism:
          "extracellular electron uptake by Sporomusa ovata for reductive acetogenesis at controlled cathode potential",
        implied_controls: [
          "abiotic electrode (no cells)",
          "open-circuit (no applied potential)",
          "non-electroactive culture comparator",
          "CO2-free reactor blank"
        ],
        key_variables: [
          "cathode potential (vs SHE)",
          "CO2 partial pressure / bicarbonate concentration",
          "biofilm density",
          "reactor temperature and pH",
          "reference electrode calibration"
        ],
        key_measurements: [
          "acetate concentration (HPLC / IC)",
          "current density and charge passed",
          "coulombic / carbon efficiency",
          "biomass attached to electrode"
        ],
        safety_flags: [
          "anaerobic culture handling",
          "compressed CO2 / gas handling",
          "electrochemical safety (high voltage source)",
          "bioreactor waste containment"
        ]
      };
    default:
      return {
        domain: "general science",
        experiment_type: "experimental study",
        organism_or_system: "see hypothesis",
        intervention: "see hypothesis",
        comparator: "appropriate baseline / control",
        primary_outcome: "measurable outcome implied by hypothesis",
        quantitative_target: "as stated in hypothesis",
        mechanism: "see hypothesis",
        implied_controls: ["positive control", "negative control"],
        key_variables: ["intervention variable", "outcome variable"],
        key_measurements: ["primary outcome", "supporting measurements"],
        safety_flags: ["expert review required for any biological/chemical work"]
      };
  }
}

export function demoLiteratureQC(topic: DemoTopic, raw: string, parsed: ParsedHypothesis): LiteratureQC {
  const refs = demoReferences(topic);
  const signal: LiteratureQC["novelty"]["signal"] =
    refs.length === 0 ? "not_found" : "similar_work_exists";
  return {
    parsed_hypothesis: parsed,
    novelty: {
      signal,
      confidence: 0.45,
      rationale:
        "Demo fallback novelty signal: live literature APIs unavailable. Relevant prior work likely exists in this area; treat this as a placeholder, not a verified search result.",
      references: refs,
      search_queries_used: demoQueries(topic),
      coverage_warnings: [
        "Live literature search unavailable; results are demo placeholders.",
        "Run with valid SEMANTIC_SCHOLAR/OPENAI keys for live novelty signal."
      ]
    }
  };
}

export function demoQueries(topic: DemoTopic): string[] {
  switch (topic) {
    case "diagnostics":
      return [
        "paper-based electrochemical biosensor anti-CRP whole blood",
        "C-reactive protein electrochemical biosensor LOD 0.5 mg/L",
        "anti-CRP antibody immobilization paper electrode"
      ];
    case "gut_health":
      return [
        "Lactobacillus rhamnosus GG C57BL/6 intestinal permeability",
        "FITC-dextran assay tight junction probiotic mice",
        "claudin-1 occludin probiotic supplementation"
      ];
    case "cell_biology":
      return [
        "trehalose vs DMSO HeLa cryopreservation viability",
        "trehalose membrane stabilization cell freezing",
        "post-thaw viability HeLa cryoprotectant"
      ];
    case "climate":
      return [
        "Sporomusa ovata bioelectrochemical acetate -400 mV SHE",
        "microbial electrosynthesis CO2 acetate cathode",
        "biocatalytic CO2 reduction Sporomusa ovata"
      ];
    default:
      return ["scientific hypothesis novelty"];
  }
}

function demoReferences(topic: DemoTopic): Reference[] {
  const make = (title: string, venue: string, year: number, url: string): Reference => ({
    id: newReferenceId(),
    title,
    authors: [],
    year,
    venue,
    url: "not_found",
    doi: null,
    source: "demo_fallback",
    relevance_reason: "Illustrative demo placeholder (no live API call)",
    relevance_score: 0.5,
    evidence_type: "literature"
  });
  switch (topic) {
    case "diagnostics":
      return [
        make("Paper-based electrochemical biosensors for CRP detection (illustrative)", "demo journal", 2022, "not_found"),
        make("Whole-blood electrochemical immunoassays (illustrative)", "demo journal", 2021, "not_found")
      ];
    case "gut_health":
      return [
        make("Lactobacillus rhamnosus GG and intestinal barrier in mice (illustrative)", "demo journal", 2020, "not_found"),
        make("FITC-dextran assay for permeability in C57BL/6 (illustrative)", "demo journal", 2019, "not_found")
      ];
    case "cell_biology":
      return [
        make("Trehalose as cryoprotectant in mammalian cells (illustrative)", "demo journal", 2018, "not_found"),
        make("DMSO standard cryopreservation outcomes (illustrative)", "demo journal", 2017, "not_found")
      ];
    case "climate":
      return [
        make("Microbial electrosynthesis with Sporomusa ovata (illustrative)", "demo journal", 2021, "not_found"),
        make("Bioelectrochemical CO2 reduction at controlled cathode potentials (illustrative)", "demo journal", 2020, "not_found")
      ];
    default:
      return [];
  }
}

export function demoEvidenceCards(topic: DemoTopic): EvidenceCard[] {
  const ts = nowIso();
  const card = (
    title: string,
    source_name: string,
    snippet: string,
    extracted_facts: string[]
  ): EvidenceCard => ({
    id: newReferenceId(),
    title,
    source_name,
    source_url: "not_found",
    source_type: "demo_fallback",
    snippet,
    extracted_facts,
    confidence: "low",
    retrieved_at: ts
  });
  switch (topic) {
    case "diagnostics":
      return [
        card(
          "Paper-based electrochemical CRP biosensor (demo placeholder)",
          "demo placeholder",
          "Illustrative description of paper-based electrochemical biosensors for CRP, with anti-CRP antibody immobilization, blocking, and electrochemical readout in whole blood.",
          [
            "anti-CRP antibody capture electrode commonly used",
            "matrix effect testing in whole blood is critical",
            "ELISA cross-comparison advised"
          ]
        ),
        card(
          "Whole blood biosensor sample handling (demo placeholder)",
          "demo placeholder",
          "Notes on whole-blood sample handling, anticoagulant choice, and biosafety practices for capillary or venous blood.",
          [
            "EDTA / heparin anticoagulant considerations",
            "BSL-2 sharps disposal",
            "protect from prolonged ambient storage"
          ]
        )
      ];
    case "gut_health":
      return [
        card(
          "FITC-dextran permeability assay (demo placeholder)",
          "demo placeholder",
          "Illustrative protocol for measuring intestinal permeability via oral FITC-dextran gavage and serum fluorescence quantification.",
          [
            "fasting prior to gavage",
            "standard curve in matched serum",
            "blinded fluorometry"
          ]
        ),
        card(
          "Mouse probiotic supplementation logistics (demo placeholder)",
          "demo placeholder",
          "Illustrative notes on probiotic dosing, viability checks, and randomization for mouse studies.",
          [
            "verify CFU per dose at study start and midpoint",
            "randomize across cages and litters",
            "blind operators where possible"
          ]
        )
      ];
    case "cell_biology":
      return [
        card(
          "HeLa cryopreservation handling (demo placeholder)",
          "demo placeholder",
          "Illustrative outline of HeLa freezing/thawing workflow with cryoprotectant comparison.",
          [
            "controlled-rate freezer recommended",
            "rapid thaw at 37°C with immediate dilution",
            "post-thaw recovery timepoint at 24h"
          ]
        ),
        card(
          "Trehalose cryoprotection notes (demo placeholder)",
          "demo placeholder",
          "Illustrative notes on trehalose as a non-permeating cryoprotectant; intracellular delivery may be limited and require supplementation.",
          [
            "trehalose poorly enters cells without modification",
            "DMSO standard remains commonly used reference",
            "confirm osmotic balance"
          ]
        )
      ];
    case "climate":
      return [
        card(
          "Sporomusa ovata bioelectrochemical setup (demo placeholder)",
          "demo placeholder",
          "Illustrative outline of an H-cell bioelectrochemical reactor for microbial electrosynthesis with Sporomusa ovata at cathode.",
          [
            "anaerobic conditions required",
            "calibrate reference electrode and convert to SHE",
            "monitor acetate by HPLC or IC"
          ]
        ),
        card(
          "Cathode potential and current density (demo placeholder)",
          "demo placeholder",
          "Notes on potentiostatic operation near -400 mV vs SHE for acetate production with carbonate-buffered medium.",
          [
            "carbonate buffer with controlled CO2",
            "report current density per geometric area",
            "carbon mass balance recommended"
          ]
        )
      ];
    default:
      return [];
  }
}
