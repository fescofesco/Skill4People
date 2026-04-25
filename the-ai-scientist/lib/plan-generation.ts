import { recomputeBudget } from "./budget";
import { detectDemoTopic, demoEvidenceCards } from "./demo-fallbacks";
import {
  newAssumptionId,
  newControlId,
  newEquipmentId,
  newMaterialId,
  newPlanId,
  newProtocolStepId,
  newRiskId,
  newTimelineId
} from "./ids";
import {
  Assumption,
  Control,
  Equipment,
  EvidenceCard,
  ExperimentPlan,
  ExperimentPlanSchema,
  LiteratureQC,
  Material,
  ParsedHypothesis,
  ProtocolStep,
  RetrievedFeedback,
  Risk,
  TimelinePhase
} from "./schemas";
import { assessSafety } from "./safety";
import { nowIso } from "./utils";

export type GeneratePlanArgs = {
  hypothesis: string;
  parsed: ParsedHypothesis;
  literatureQC: LiteratureQC;
  evidenceCards: EvidenceCard[];
  feedback: RetrievedFeedback[];
};

export async function generateExperimentPlan(args: GeneratePlanArgs): Promise<ExperimentPlan> {
  const safety = assessSafety(args.hypothesis, args.parsed);
  if (safety.unsafe) {
    return restrictedPlan(args, safety.reason || "Request is outside safe scope.");
  }
  return deterministicReviewPlan(args);
}

function deterministicReviewPlan(args: GeneratePlanArgs): ExperimentPlan {
  const topic = detectDemoTopic(args.hypothesis);
  const evidenceCards = args.evidenceCards.length ? args.evidenceCards : demoEvidenceCards(topic);
  const safety = assessSafety(args.hypothesis, args.parsed);
  const content = domainContent(topic);

  const feedbackRules = args.feedback.map((item) => item.feedback.derived_rule);
  const feedbackNote = feedbackRules.length
    ? ` Prior scientist feedback to apply: ${feedbackRules.join(" ")}`
    : "";

  const materials = makeMaterials(content.materials);
  const equipment = makeEquipment(content.equipment);
  const budget = recomputeBudget({
    materials,
    equipment,
    currency: "USD",
    contingencyPercent: 15,
    notesPrefix:
      "Catalog numbers and prices are only included when verified by live supplier evidence; otherwise they remain not_found/null."
  });

  const plan: ExperimentPlan = {
    plan_id: newPlanId(),
    created_at: nowIso(),
    hypothesis: {
      raw: args.hypothesis,
      parsed: args.parsed
    },
    novelty: {
      signal: args.literatureQC.novelty.signal,
      confidence: args.literatureQC.novelty.confidence,
      rationale: args.literatureQC.novelty.rationale,
      references: args.literatureQC.novelty.references
    },
    applied_feedback: args.feedback.map((item) => ({
      feedback_id: item.feedback.id,
      derived_rule: item.feedback.derived_rule,
      similarity_score: item.similarity_score,
      reason_applied: item.reason || "Matched by domain, experiment type, tags, or keyword overlap.",
      source_item_type: item.feedback.item_type,
      severity: item.feedback.severity
    })),
    executive_summary: {
      objective: content.objective,
      experimental_strategy:
        `${content.strategy} The plan is intentionally framed as an expert-review operations plan, not an executable SOP.${feedbackNote}`,
      expected_result: content.expectedResult,
      major_risks: content.majorRisks,
      decision_gate: content.decisionGate
    },
    safety_ethics_compliance: {
      overall_risk_level: content.riskLevel,
      biosafety_level_assumption: content.biosafety,
      human_subjects_or_samples: content.humanSamples,
      animal_work: content.animalWork,
      environmental_or_gmo_considerations: content.environmental,
      required_approvals: content.approvals,
      ppe: content.ppe,
      waste_disposal: content.waste,
      critical_warnings: Array.from(
        new Set([
          ...content.criticalWarnings,
          ...safety.flags.map((flag) => `Detected safety flag: ${flag}`),
          "Expert review required before execution; generated content is not a replacement for approved institutional SOPs."
        ])
      ),
      expert_review_required: true
    },
    protocol: makeProtocol(content.protocol, evidenceCards),
    materials,
    equipment,
    budget,
    timeline: makeTimeline(content.timeline),
    validation: {
      primary_readout: content.validation.primary,
      secondary_readouts: content.validation.secondary,
      controls: makeControls(content.validation.controls),
      replicate_strategy: content.validation.replicates,
      sample_size_rationale: content.validation.sampleSize,
      randomization_blinding: content.validation.randomization,
      statistical_analysis: content.validation.stats,
      success_criteria: content.validation.success,
      failure_criteria: content.validation.failure,
      data_quality_checks: content.validation.quality,
      editable: true
    },
    risks_and_mitigations: makeRisks(content.risks),
    assumptions: makeAssumptions(content.assumptions),
    evidence_quality: {
      literature_coverage: args.literatureQC.novelty.references.length >= 3 ? "medium" : "low",
      supplier_data_confidence: evidenceCards.some((e) => e.source_type === "supplier_page")
        ? "medium"
        : "low",
      protocol_grounding_confidence: evidenceCards.some((e) => e.source_type === "protocol")
        ? "medium"
        : "low",
      overall_plan_confidence:
        args.literatureQC.novelty.references.length >= 3 && evidenceCards.length >= 3
          ? "medium"
          : "low",
      known_gaps: [
        "Fast literature QC is not a systematic review.",
        "Supplier pricing and catalog data may be incomplete unless live Tavily results identify official pages.",
        "Operational parameters must be replaced by approved local SOPs and reviewed by a domain expert.",
        ...content.knownGaps
      ],
      evidence_cards: evidenceCards
    }
  };

  return ExperimentPlanSchema.parse(plan);
}

function restrictedPlan(args: GeneratePlanArgs, reason: string): ExperimentPlan {
  const base = domainContent("generic");
  const materials: Material[] = [];
  const equipment: Equipment[] = [];
  const plan: ExperimentPlan = {
    plan_id: newPlanId(),
    created_at: nowIso(),
    hypothesis: { raw: args.hypothesis, parsed: args.parsed },
    novelty: {
      signal: args.literatureQC.novelty.signal,
      confidence: args.literatureQC.novelty.confidence,
      rationale: args.literatureQC.novelty.rationale,
      references: args.literatureQC.novelty.references
    },
    applied_feedback: [],
    executive_summary: {
      objective: "Safety-restricted request.",
      experimental_strategy:
        "No operational plan was generated. Reframe the hypothesis into a compliant, non-harmful, institutionally approved study design.",
      expected_result: "A safe alternative planning request can be evaluated after reframing.",
      major_risks: [reason],
      decision_gate: "Biosafety, ethics, and PI approval required before further planning."
    },
    safety_ethics_compliance: {
      overall_risk_level: "high",
      biosafety_level_assumption: "Not assessed because request was restricted.",
      human_subjects_or_samples: "Not assessed.",
      animal_work: "Not assessed.",
      environmental_or_gmo_considerations: "Not assessed.",
      required_approvals: ["Institutional biosafety/ethics review", "Principal investigator approval"],
      ppe: [],
      waste_disposal: [],
      critical_warnings: [reason, "No actionable protocol was generated."],
      expert_review_required: true
    },
    protocol: makeProtocol(base.protocol, []),
    materials,
    equipment,
    budget: recomputeBudget({ materials, equipment }),
    timeline: makeTimeline(base.timeline),
    validation: {
      primary_readout: "Not applicable until the study is reframed safely.",
      secondary_readouts: [],
      controls: makeControls(base.validation.controls),
      replicate_strategy: "Not applicable.",
      sample_size_rationale: "Not applicable.",
      randomization_blinding: "Not applicable.",
      statistical_analysis: "Not applicable.",
      success_criteria: [],
      failure_criteria: [],
      data_quality_checks: [],
      editable: true
    },
    risks_and_mitigations: makeRisks(base.risks),
    assumptions: makeAssumptions(base.assumptions),
    evidence_quality: {
      literature_coverage: "low",
      supplier_data_confidence: "low",
      protocol_grounding_confidence: "low",
      overall_plan_confidence: "low",
      known_gaps: ["Safety-restricted; no operational plan generated."],
      evidence_cards: []
    }
  };
  return ExperimentPlanSchema.parse(plan);
}

type Topic = ReturnType<typeof detectDemoTopic>;

function domainContent(topic: Topic) {
  switch (topic) {
    case "diagnostics":
      return {
        objective:
          "Assess whether an anti-CRP paper electrochemical biosensor can detect CRP in whole blood with clinically relevant sensitivity and timing.",
        strategy:
          "Build evidence-gated phases for sensor fabrication review, matrix-effect testing, reference ELISA comparison, and data-quality analysis.",
        expectedResult:
          "A credible prototype dossier showing buffer calibration, whole-blood spike recovery, and reference-assay agreement without overclaiming clinical validity.",
        majorRisks: [
          "Whole-blood matrix effects",
          "Non-specific antibody binding",
          "Clinical-performance overclaims from prototype data"
        ],
        decisionGate:
          "Only proceed beyond prototype if matrix recovery and ELISA concordance meet pre-registered criteria.",
        riskLevel: "medium" as const,
        biosafety: "Assume BSL-2 for whole human blood handling.",
        humanSamples:
          "Whole-blood work requires approved sourcing, consent/IRB determination, and bloodborne-pathogen training.",
        animalWork: "None expected.",
        environmental: "None expected.",
        approvals: ["IRB or exemption determination", "Institutional biosafety approval"],
        ppe: ["Lab coat", "Gloves", "Eye protection"],
        waste: ["Biohazard waste stream for blood-contact materials", "Sharps disposal where applicable"],
        criticalWarnings: [
          "Do not claim ELISA-equivalent performance from buffer-only calibration.",
          "Prototype results do not imply regulatory clearance."
        ],
        protocol: [
          "Review sensor surface chemistry and antibody immobilization evidence before fabricating prototype batches.",
          "Run non-clinical calibration and specificity checks using approved controls.",
          "Evaluate matrix effects using approved whole-blood or surrogate matrix panels.",
          "Compare against a reference ELISA workflow and report agreement statistics.",
          "Hold an expert review gate before any clinical-performance claim."
        ],
        materials: [
          "Anti-CRP capture antibody",
          "CRP calibration/reference material",
          "Paper or screen-printed electrode substrate",
          "Blocking and wash buffers",
          "Reference CRP ELISA kit"
        ],
        equipment: ["Potentiostat", "Plate reader", "Biosafety cabinet"],
        timeline: ["Literature and safety review", "Prototype evidence review", "Analytical validation", "Reference comparison"],
        validation: {
          primary: "CRP concentration estimate compared with reference method.",
          secondary: ["Matrix spike recovery", "Assay variability", "Interference screening"],
          controls: [
            ["Blank/no analyte", "negative", "Establish background", "Signal near baseline"],
            ["Non-specific antibody control", "negative", "Assess non-specific binding", "Minimal signal"],
            ["CRP reference material", "reference_standard", "Calibrate response", "Monotonic response"],
            ["Whole-blood matrix spike", "biological", "Assess matrix effect", "Recovery within pre-set range"],
            ["ELISA reference comparison", "reference_standard", "Benchmark method", "High agreement within limits"]
          ],
          replicates: "Use technical replicates per condition and a pre-specified number of independent matrix samples.",
          sampleSize:
            "Justify paired-sample count from desired agreement precision and expected variability; pilot data should inform the final number.",
          randomization:
            "Blind analysts to reference-assay values and randomize sample order across sensor lots.",
          stats: "Calibration model, Bland-Altman agreement, correlation, confidence intervals, and pre-specified acceptance windows.",
          success: ["LOD target supported by matrix data", "Reference-assay agreement meets threshold"],
          failure: ["Matrix recovery fails", "Agreement with ELISA is not acceptable"],
          quality: ["Lot tracking", "Outlier rules", "Hemolysis/interference notes"]
        },
        risks: [
          ["Matrix interference", "high", "high", "Include matrix spike and interference panels.", "Poor spike recovery"],
          ["Supplier variability", "medium", "medium", "Track antibody/electrode lots.", "Lot-to-lot drift"],
          ["Approval delays", "medium", "medium", "Submit ethics/biosafety review early.", "Approval not received"]
        ],
        assumptions: [
          ["Antibody is fit for whole-blood matrix.", "Sensitivity/specficity may collapse.", "Verify with matrix spike controls."],
          ["Electrode lots are reproducible.", "Validation estimates become unstable.", "Lot-level QC before matrix testing."]
        ],
        knownGaps: ["Clinical validation and regulatory pathway are outside prototype scope."]
      };
    case "gut_health":
      return {
        objective:
          "Evaluate whether LGG supplementation is associated with reduced intestinal permeability in C57BL/6 mice.",
        strategy:
          "Use an IACUC-approved, randomized, blinded animal-study design with permeability and tight-junction readouts.",
        expectedResult:
          "A reviewed study plan with justified cohort sizing, cage-effect controls, humane endpoints, and mechanistic readouts.",
        majorRisks: ["Animal welfare", "Cage effects", "Underpowered cohort design", "Probiotic viability drift"],
        decisionGate:
          "Proceed only after IACUC approval, power rationale, and randomization/blinding plan are approved.",
        riskLevel: "medium" as const,
        biosafety: "Assume animal facility procedures and institutional microbial handling requirements.",
        humanSamples: "None.",
        animalWork: "C57BL/6 mouse study; IACUC or equivalent approval required.",
        environmental: "No environmental release; contain live microbial supplement and animal waste.",
        approvals: ["IACUC approval", "Animal facility approval", "Biosafety review for live microbe handling"],
        ppe: ["Animal-room PPE", "Gloves", "Lab coat"],
        waste: ["Animal waste per facility SOP", "Microbial waste per biosafety SOP"],
        criticalWarnings: [
          "Avoid underpowered n=3 designs.",
          "Account for cage/litter effects and humane endpoints."
        ],
        protocol: [
          "Finalize IACUC-approved cohort design with randomization and humane endpoints.",
          "Verify probiotic identity and viability against a documented acceptance plan.",
          "Conduct blinded supplementation and monitoring using facility SOPs.",
          "Measure permeability with an approved assay workflow and matrix-matched standards.",
          "Measure tight-junction readouts and analyze using the pre-registered statistical plan."
        ],
        materials: [
          "Lactobacillus rhamnosus GG source",
          "C57BL/6 mice",
          "FITC-dextran permeability tracer",
          "Tight-junction protein antibodies or qPCR assays",
          "Animal facility consumables"
        ],
        equipment: ["Animal facility", "Fluorescence plate reader", "qPCR or Western blot system"],
        timeline: ["Protocol approval", "Cohort setup", "Supplementation", "Permeability assay", "Molecular analysis"],
        validation: {
          primary: "Permeability readout compared between randomized treatment and vehicle cohorts.",
          secondary: ["Claudin-1 expression", "Occludin expression", "Body-weight and welfare metrics"],
          controls: [
            ["Vehicle control", "vehicle", "Control for gavage/handling", "Baseline permeability"],
            ["Assay standard curve", "technical", "Quantify fluorescence", "Linear accepted curve"],
            ["Blinded sample identity", "technical", "Reduce measurement bias", "Analysts remain blinded"]
          ],
          replicates: "Biological replicates sized by power analysis; technical duplicates for assay readout.",
          sampleSize:
            "Justify with expected effect size, variance, attrition, and cage-clustering adjustment.",
          randomization: "Block randomize across cages/litters; blind operators and analysts when feasible.",
          stats: "Pre-specified model with treatment as fixed effect and cage as a random or blocking factor.",
          success: ["Pre-specified permeability reduction", "Concordant tight-junction evidence"],
          failure: ["No meaningful effect", "Welfare or QC criteria fail"],
          quality: ["CFU verification", "Standard-curve QC", "Cage metadata retained"]
        },
        risks: [
          ["Underpowered study", "high", "medium", "Perform power analysis and attrition planning.", "Wide confidence intervals"],
          ["Cage confounding", "medium", "high", "Randomize across cages and model cage effects.", "Outcome clusters by cage"],
          ["Probiotic viability loss", "medium", "medium", "Verify identity and viable count.", "Viability QC fails"]
        ],
        assumptions: [
          ["Permeability assay reflects intestinal barrier function.", "Result may be misleading.", "Add orthogonal readout."],
          ["LGG dose remains viable through study.", "Intervention not delivered as intended.", "Viability checks."]
        ],
        knownGaps: ["Animal per-diem costs vary by institution."]
      };
    case "cell_biology":
      return {
        objective:
          "Compare trehalose, sucrose, and standard cryoprotection approaches for post-thaw HeLa viability.",
        strategy:
          "Use authenticated, mycoplasma-free cells and blinded paired freeze/thaw comparisons with recovery readouts.",
        expectedResult: "A reproducible comparison report for viability, recovery, and morphology.",
        majorRisks: ["Cell-line contamination", "Trehalose delivery limitations", "Cryogenic hazards"],
        decisionGate:
          "Proceed only if cell authentication and mycoplasma checks pass before comparison.",
        riskLevel: "medium" as const,
        biosafety: "Assume BSL-2 for human-derived cell line work.",
        humanSamples: "Human-derived HeLa cell line; not fresh human samples.",
        animalWork: "None.",
        environmental: "No release; dispose of biological waste via institutional SOP.",
        approvals: ["Institutional biosafety approval for BSL-2 cell culture"],
        ppe: ["Lab coat", "Gloves", "Cryogenic gloves", "Face protection for cryogenic handling"],
        waste: ["Autoclave biological waste", "Chemical waste per hygiene plan"],
        criticalWarnings: ["Authenticate cell line and confirm mycoplasma-negative status before comparison."],
        protocol: [
          "Authenticate cell stock and document passage number and mycoplasma status.",
          "Define cryoprotectant formulations and osmolarity acceptance criteria.",
          "Run paired freeze/thaw comparisons under approved local cell-culture SOPs.",
          "Measure viability and recovery at pre-specified timepoints.",
          "Analyze treatment differences and decide whether trehalose merits further optimization."
        ],
        materials: [
          "Authenticated HeLa cell stock",
          "Trehalose",
          "Sucrose",
          "Standard cryoprotectant medium",
          "Viability assay reagents",
          "Mycoplasma test kit"
        ],
        equipment: ["Biosafety cabinet", "Cell incubator", "Cryostorage system", "Cell counter or flow cytometer"],
        timeline: ["Cell QC", "Formulation review", "Freeze/thaw comparison", "Recovery readouts", "Analysis"],
        validation: {
          primary: "Post-thaw percent viability.",
          secondary: ["Recovery/proliferation", "Morphology", "Mycoplasma status"],
          controls: [
            ["Standard cryoprotectant control", "reference_standard", "Benchmark current practice", "Historical viability range"],
            ["Sucrose comparator", "biological", "Sugar comparator", "Intermediate or lower viability"],
            ["Fresh cell baseline", "baseline", "Define viability ceiling", "High viability"],
            ["Dead-cell assay control", "technical", "Validate assay signal", "Dead-cell signal detected"]
          ],
          replicates: "Independent biological replicate freezes and technical replicate viability counts.",
          sampleSize: "Pilot variance should define final replicate count for detecting a 15 percentage-point difference.",
          randomization: "Blind vial labels during counting and randomize condition order.",
          stats: "ANOVA or mixed-effects model with condition and timepoint, plus confidence intervals.",
          success: ["Trehalose improves viability by target margin", "Recovery remains acceptable"],
          failure: ["No meaningful viability gain", "QC contamination detected"],
          quality: ["Authentication report", "Mycoplasma result", "Instrument calibration log"]
        },
        risks: [
          ["Trehalose delivery limitation", "high", "medium", "Treat as hypothesis risk and include comparator arms.", "No effect versus sucrose"],
          ["Contamination", "high", "medium", "QC before and after study.", "Mycoplasma positive"],
          ["Cryogenic hazard", "high", "low", "Use trained staff and cryogenic PPE.", "Near-miss or spill report"]
        ],
        assumptions: [
          ["HeLa stock is representative and authenticated.", "Results invalid.", "STR profile and mycoplasma test."],
          ["Assay readout reflects true viability.", "Treatment effect biased.", "Use orthogonal viability readout."]
        ],
        knownGaps: ["Exact formulation parameters must come from approved cell-culture SOPs."]
      };
    case "climate":
      return {
        objective:
          "Assess whether a bioelectrochemical system with Sporomusa ovata can improve CO2-to-acetate performance versus benchmarks.",
        strategy:
          "Frame the work around reactor design review, anaerobic culture containment, calibrated electrochemical controls, and normalized acetate/productivity metrics.",
        expectedResult:
          "A benchmark-ready data package with acetate production normalized by reactor volume, electrode area, biomass, and charge passed.",
        majorRisks: ["Anaerobic failure", "Reference-electrode drift", "Gas-handling hazards", "Normalization errors"],
        decisionGate:
          "Proceed only if abiotic and open-circuit controls rule out non-biological acetate background.",
        riskLevel: "medium" as const,
        biosafety: "Assume low-risk anaerobic microbial culture with institutional biosafety review.",
        humanSamples: "None.",
        animalWork: "None.",
        environmental: "No environmental release; contain cultures and reactor effluent.",
        approvals: ["Institutional biosafety review", "Chemical/electrical safety review"],
        ppe: ["Lab coat", "Gloves", "Eye protection"],
        waste: ["Autoclave or chemically disinfect microbial waste", "Dispose electrolyte per chemical hygiene plan"],
        criticalWarnings: ["Normalize cathode potential to SHE and verify reference electrode calibration."],
        protocol: [
          "Review anaerobic reactor design, containment, gas handling, and electrical safety plan.",
          "Establish calibration plan for reference electrode and potential conversion to SHE.",
          "Run controlled reactor conditions with abiotic, no-cell, and open-circuit controls.",
          "Quantify acetate and carbon balance using validated analytical chemistry.",
          "Report performance normalized to volume, electrode area, biomass, and charge passed."
        ],
        materials: [
          "Sporomusa ovata strain source",
          "Anaerobic medium components",
          "Bioelectrochemical reactor consumables",
          "Reference electrode",
          "Acetate standards"
        ],
        equipment: ["Potentiostat", "Anaerobic chamber or manifold", "HPLC or ion chromatography", "Gas regulator"],
        timeline: ["Safety review", "Reactor setup", "Culture establishment", "Controlled runs", "Analytics and normalization"],
        validation: {
          primary: "Acetate production rate normalized to reactor volume and time.",
          secondary: ["Current density", "Coulombic efficiency", "Carbon balance", "Biomass estimate"],
          controls: [
            ["Abiotic electrode", "negative", "Detect non-biological acetate", "No acetate above background"],
            ["No-cell reactor", "negative", "Detect medium/background effects", "No acetate above background"],
            ["Open-circuit control", "technical", "Assess potential dependence", "Lower or no acetate production"],
            ["Reference electrode calibration", "technical", "Normalize potential to SHE", "Calibration within tolerance"]
          ],
          replicates: "Independent reactor runs with technical analytical replicates.",
          sampleSize: "Pilot variance should define number of reactor replicates for benchmark comparison.",
          randomization: "Randomize run order where reactor availability permits; blind chromatography integration.",
          stats: "Compare normalized production rates with confidence intervals and benchmark threshold.",
          success: ["Rate target met", "Controls exclude abiotic production", "Carbon/electron balance plausible"],
          failure: ["Controls produce acetate", "Reference electrode drift invalidates potential"],
          quality: ["Calibration logs", "Blank chromatograms", "Mass-balance checks"]
        },
        risks: [
          ["Reference electrode drift", "high", "medium", "Calibrate before/after runs and report conversion.", "Potential shift"],
          ["Anaerobic contamination", "medium", "medium", "Monitor contamination and redox indicators.", "Growth/readout anomaly"],
          ["Benchmark overclaim", "medium", "medium", "Normalize to multiple denominators.", "Benchmark comparison changes by metric"]
        ],
        assumptions: [
          ["Acetate signal is biological and not background.", "False positive performance claim.", "Abiotic/no-cell controls."],
          ["Benchmark metric is comparable.", "Improvement claim invalid.", "Normalize across volume/electrode/biomass."]
        ],
        knownGaps: ["Culture and reactor conditions must follow approved local SOPs."]
      };
    default:
      return {
        objective: "Turn the scientific hypothesis into a reviewable experiment-planning dossier.",
        strategy:
          "Use staged literature QC, materials review, safety screening, validation design, and feedback application.",
        expectedResult: "A structured plan ready for expert correction and iteration.",
        majorRisks: ["Unknown safety/compliance constraints", "Insufficient evidence grounding"],
        decisionGate: "Proceed only after expert review and approved SOP selection.",
        riskLevel: "medium" as const,
        biosafety: "Unknown until domain expert review.",
        humanSamples: "Assess during expert review.",
        animalWork: "Assess during expert review.",
        environmental: "Assess during expert review.",
        approvals: ["Domain expert review", "Institutional safety review if applicable"],
        ppe: ["Follow local SOP"],
        waste: ["Follow local SOP"],
        criticalWarnings: ["Generated plan is for review, not direct execution."],
        protocol: [
          "Confirm scope, safety, and approvals.",
          "Run literature and protocol evidence review.",
          "Identify materials and supplier gaps.",
          "Define validation readouts and controls.",
          "Complete expert review before execution."
        ],
        materials: ["Primary reagent/material", "Reference standard", "Controls", "Consumables"],
        equipment: ["Domain-appropriate instrument", "Safety equipment"],
        timeline: ["Review", "Sourcing", "Pilot", "Validation"],
        validation: {
          primary: "Primary measurable outcome from hypothesis.",
          secondary: ["Secondary readout", "QC readout"],
          controls: [
            ["Negative control", "negative", "Measure background", "Baseline response"],
            ["Positive/reference control", "positive", "Confirm assay works", "Expected signal"]
          ],
          replicates: "Biological and technical replicates based on expected variance.",
          sampleSize: "Power or precision rationale required before execution.",
          randomization: "Randomize and blind wherever possible.",
          stats: "Pre-register analysis and acceptance criteria.",
          success: ["Pre-specified target met"],
          failure: ["Controls fail", "Primary target not met"],
          quality: ["Calibration", "Lot tracking", "Missing-data rules"]
        },
        risks: [["Evidence gap", "medium", "high", "Collect targeted evidence before execution.", "Low confidence section"]],
        assumptions: [["Local SOP exists.", "Plan cannot be run safely.", "PI/lab manager verification."]],
        knownGaps: ["Generic fallback used; add domain-specific evidence."]
      };
  }
}

function makeProtocol(items: string[], evidence: EvidenceCard[]): ProtocolStep[] {
  const ids = evidence.map((e) => e.id);
  return items.slice(0, Math.max(3, items.length)).map((title, i) => ({
    id: newProtocolStepId(i),
    title,
    purpose: "Define a reviewable planning phase and the evidence needed before operational execution.",
    instructions: [
      "Review relevant literature, protocol repositories, supplier evidence, and local SOPs.",
      "Record assumptions, decision criteria, and expert corrections.",
      "Do not execute without approved institutional protocol."
    ],
    parameters: {
      reagent_amounts: [],
      concentrations: [],
      temperatures: [],
      durations: [],
      volumes: [],
      equipment_settings: [],
      environmental_conditions: []
    },
    acceptance_criteria: ["Expert reviewer accepts this phase as scientifically and operationally grounded."],
    common_failure_modes: ["Evidence is too weak", "Required approval or supplier data is missing"],
    troubleshooting: ["Add targeted literature/supplier search", "Escalate to domain expert"],
    safety_notes: ["Follow approved local SOPs and compliance requirements."],
    source_reference_ids: ids.slice(0, 3),
    editable: true
  }));
}

function makeMaterials(items: string[]): Material[] {
  return items.map((name, i) => ({
    id: newMaterialId(i),
    name,
    purpose: "Required or candidate material for the reviewed study design.",
    supplier: "not_found",
    catalog_number: "not_found",
    pack_size: "not_found",
    quantity_needed: "to be determined by approved SOP",
    unit_cost: null,
    estimated_cost: null,
    currency: "USD",
    source_url: "not_found",
    confidence: "low",
    substitution_options: ["Scientist-approved equivalent"],
    notes: "Supplier facts were not verified; do not order until reviewed.",
    editable: true
  }));
}

function makeEquipment(items: string[]): Equipment[] {
  return items.map((name, i) => ({
    id: newEquipmentId(i),
    name,
    purpose: "Required or likely required equipment.",
    required_or_optional: "required",
    estimated_cost_if_not_available: null,
    availability_assumption: "Verify availability with the lab manager or core facility.",
    notes: "Cost omitted unless verified by supplier/facility quote.",
    editable: true
  }));
}

function makeTimeline(items: string[]): TimelinePhase[] {
  return items.slice(0, Math.max(3, items.length)).map((name, i) => ({
    id: newTimelineId(i),
    name,
    duration: i === 0 ? "1-2 weeks" : "1-3 weeks",
    dependencies: i === 0 ? [] : [newTimelineId(i - 1)],
    deliverables: [`${name} review artifact`],
    decision_gate: "PI/scientist sign-off required before moving forward.",
    risks_to_schedule: ["Approval, supplier, or evidence-gathering delay"],
    editable: true
  }));
}

function makeControls(items: string[][]): Control[] {
  return items.map(([name, controlType, purpose, expected], i) => ({
    id: newControlId(i),
    name,
    control_type: controlType as Control["control_type"],
    purpose,
    expected_result: expected,
    editable: true
  }));
}

function makeRisks(items: string[][]): Risk[] {
  return items.map(([risk, severity, likelihood, mitigation, detection], i) => ({
    id: newRiskId(i),
    risk,
    severity: severity as Risk["severity"],
    likelihood: likelihood as Risk["likelihood"],
    mitigation,
    detection_signal: detection,
    editable: true
  }));
}

function makeAssumptions(items: string[][]): Assumption[] {
  return items.map(([assumption, impact, verify], i) => ({
    id: newAssumptionId(i),
    assumption,
    impact_if_wrong: impact,
    how_to_verify: verify,
    editable: true
  }));
}
