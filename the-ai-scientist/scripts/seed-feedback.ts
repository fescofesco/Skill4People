import { replaceAllFeedback } from "../lib/feedback-store";
import { newFeedbackId } from "../lib/ids";
import { ScientistFeedback } from "../lib/schemas";

const now = new Date().toISOString();

const base = {
  created_at: now,
  source_plan_id: "seed",
  confidence: 0.9,
  embedding_model: undefined,
  embedding: undefined
};

const feedback: ScientistFeedback[] = [
  {
    ...base,
    id: newFeedbackId(),
    hypothesis: "CRP whole-blood biosensor",
    domain: "diagnostics",
    experiment_type: "biosensor development and validation",
    item_type: "validation",
    item_id: "seed_diagnostics",
    original_context: "Claim ELISA-equivalent performance from buffer calibration.",
    correction:
      "Include whole-blood matrix spike recovery controls and reference ELISA comparison before claiming ELISA-equivalent sensitivity.",
    reason: "Buffer-only calibration does not prove whole-blood performance.",
    rating_before: 2,
    derived_rule:
      "For CRP whole-blood biosensor validation, include matrix-effect controls and compare against a reference ELISA; do not claim ELISA-equivalent performance from buffer-only calibration.",
    tags: ["diagnostics", "biosensor", "crp", "whole blood", "validation", "elisa"],
    applicability: "similar_experiment_type",
    severity: "critical"
  },
  {
    ...base,
    id: newFeedbackId(),
    hypothesis: "LGG C57BL/6 FITC-dextran study",
    domain: "gut health",
    experiment_type: "in vivo mouse probiotic supplementation study",
    item_type: "validation",
    item_id: "seed_gut",
    original_context: "Use n=3 mice per group.",
    correction:
      "Use a justified group size, randomize across cages, and account for cage effects; avoid underpowered n=3 designs.",
    reason: "Mouse permeability studies have substantial biological and cage-level variance.",
    rating_before: 2,
    derived_rule:
      "For C57BL/6 FITC-dextran intestinal permeability studies, include randomization, cage-effect awareness, and a justified group size; avoid underpowered n=3 designs.",
    tags: ["gut health", "mouse", "fitc-dextran", "sample size", "randomization"],
    applicability: "similar_experiment_type",
    severity: "critical"
  },
  {
    ...base,
    id: newFeedbackId(),
    hypothesis: "HeLa cryopreservation trehalose",
    domain: "cell biology",
    experiment_type: "cryopreservation comparison study",
    item_type: "validation",
    item_id: "seed_cell",
    original_context: "Compare trehalose without DMSO standard or cell QC.",
    correction:
      "Include DMSO standard control, post-thaw recovery timepoint, cell-line authentication, and mycoplasma testing.",
    reason: "Cell-line quality and standard control are necessary to interpret cryopreservation comparisons.",
    rating_before: 3,
    derived_rule:
      "For HeLa cryopreservation comparisons, include DMSO standard control, post-thaw recovery timepoint, cell-line authentication, and mycoplasma testing.",
    tags: ["cell biology", "hela", "cryopreservation", "dmso", "mycoplasma"],
    applicability: "similar_experiment_type",
    severity: "important"
  },
  {
    ...base,
    id: newFeedbackId(),
    hypothesis: "Sporomusa ovata bioelectrochemical acetate",
    domain: "climate",
    experiment_type: "bioelectrochemical CO2 fixation",
    item_type: "validation",
    item_id: "seed_climate",
    original_context: "Report acetate rate without normalization.",
    correction:
      "Normalize acetate rate to reactor volume, electrode area, and biomass where possible, and verify cathode potential against SHE.",
    reason: "Benchmarking is misleading without normalization and potential calibration.",
    rating_before: 3,
    derived_rule:
      "For Sporomusa ovata bioelectrochemical acetate production, normalize acetate rate to reactor volume, electrode area, and biomass where possible, and verify cathode potential against SHE.",
    tags: ["climate", "bioelectrochemical", "sporomusa", "acetate", "normalization"],
    applicability: "similar_experiment_type",
    severity: "important"
  }
];

async function main() {
  await replaceAllFeedback(feedback);
  console.log(`Seeded ${feedback.length} feedback examples.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
