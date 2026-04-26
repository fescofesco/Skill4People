import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const Confidence01 = z.number().min(0).max(1);

export const ParsedHypothesisSchema = z.object({
  domain: z.string(),
  experiment_type: z.string(),
  organism_or_system: z.string(),
  intervention: z.string(),
  comparator: z.string(),
  primary_outcome: z.string(),
  quantitative_target: z.string(),
  mechanism: z.string(),
  implied_controls: z.array(z.string()),
  key_variables: z.array(z.string()),
  key_measurements: z.array(z.string()),
  safety_flags: z.array(z.string())
});
export type ParsedHypothesis = z.infer<typeof ParsedHypothesisSchema>;

export const ReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()).optional().default([]),
  year: z.number().int().nullable().optional(),
  venue: z.string().nullable().optional(),
  url: z.string().url().or(z.literal("not_found")),
  doi: z.string().nullable().optional(),
  source: z.enum([
    "semantic_scholar",
    "arxiv",
    "pubmed",
    "openalex",
    "crossref",
    "tavily",
    "protocol_repository",
    "supplier",
    "manual",
    "demo_fallback"
  ]),
  relevance_reason: z.string(),
  relevance_score: Confidence01,
  evidence_type: z.enum([
    "literature",
    "protocol",
    "supplier",
    "standard",
    "technical_note",
    "review",
    "unknown"
  ])
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const NoveltySchema = z.object({
  signal: z.enum(["not_found", "similar_work_exists", "exact_match_found"]),
  confidence: Confidence01,
  rationale: z.string(),
  references: z.array(ReferenceSchema).max(5),
  search_queries_used: z.array(z.string()),
  coverage_warnings: z.array(z.string())
});
export type Novelty = z.infer<typeof NoveltySchema>;

export const LiteratureQCSchema = z.object({
  parsed_hypothesis: ParsedHypothesisSchema,
  novelty: NoveltySchema
});
export type LiteratureQC = z.infer<typeof LiteratureQCSchema>;

export const EvidenceCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  source_name: z.string(),
  source_url: z.string().url().or(z.literal("not_found")),
  source_type: z.enum([
    "paper",
    "protocol",
    "supplier_page",
    "technical_bulletin",
    "standard",
    "review",
    "demo_fallback",
    "unknown"
  ]),
  snippet: z.string(),
  extracted_facts: z.array(z.string()),
  confidence: z.enum(["low", "medium", "high"]),
  retrieved_at: z.string()
});
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;

export const ProtocolStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  purpose: z.string(),
  instructions: z.array(z.string()),
  parameters: z
    .object({
      reagent_amounts: z.array(z.string()).default([]),
      concentrations: z.array(z.string()).default([]),
      temperatures: z.array(z.string()).default([]),
      durations: z.array(z.string()).default([]),
      volumes: z.array(z.string()).default([]),
      equipment_settings: z.array(z.string()).default([]),
      environmental_conditions: z.array(z.string()).default([])
    })
    .default({}),
  acceptance_criteria: z.array(z.string()),
  common_failure_modes: z.array(z.string()),
  troubleshooting: z.array(z.string()),
  safety_notes: z.array(z.string()),
  source_reference_ids: z.array(z.string()),
  editable: z.literal(true)
});
export type ProtocolStep = z.infer<typeof ProtocolStepSchema>;

export const MaterialSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  supplier: z.string(),
  catalog_number: z.string(),
  pack_size: z.string(),
  quantity_needed: z.string(),
  unit_cost: z.number().nullable(),
  estimated_cost: z.number().nullable(),
  currency: z.string(),
  source_url: z.string().url().nullable().or(z.literal("not_found")),
  confidence: z.enum(["low", "medium", "high"]),
  substitution_options: z.array(z.string()),
  notes: z.string(),
  editable: z.literal(true)
});
export type Material = z.infer<typeof MaterialSchema>;

export const EquipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  purpose: z.string(),
  required_or_optional: z.enum(["required", "optional"]),
  estimated_cost_if_not_available: z.number().nullable(),
  availability_assumption: z.string(),
  notes: z.string(),
  editable: z.literal(true)
});
export type Equipment = z.infer<typeof EquipmentSchema>;

export const BudgetSchema = z.object({
  currency: z.string(),
  material_line_items_total: z.number(),
  equipment_line_items_total_if_needed: z.number(),
  labor_or_service_estimate: z.number().nullable(),
  contingency_percent: z.number(),
  contingency_amount: z.number(),
  estimated_total: z.number(),
  calculation_notes: z.string(),
  low_confidence_items: z.array(z.string()),
  editable: z.literal(true)
});
export type Budget = z.infer<typeof BudgetSchema>;

export const TimelinePhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.string(),
  dependencies: z.array(z.string()),
  deliverables: z.array(z.string()),
  decision_gate: z.string(),
  risks_to_schedule: z.array(z.string()),
  editable: z.literal(true)
});
export type TimelinePhase = z.infer<typeof TimelinePhaseSchema>;

export const ControlSchema = z.object({
  id: z.string(),
  name: z.string(),
  control_type: z.enum([
    "positive",
    "negative",
    "vehicle",
    "baseline",
    "technical",
    "biological",
    "reference_standard",
    "sham",
    "other"
  ]),
  purpose: z.string(),
  expected_result: z.string(),
  editable: z.literal(true)
});
export type Control = z.infer<typeof ControlSchema>;

export const ValidationSchema = z.object({
  primary_readout: z.string(),
  secondary_readouts: z.array(z.string()),
  controls: z.array(ControlSchema),
  replicate_strategy: z.string(),
  sample_size_rationale: z.string(),
  randomization_blinding: z.string(),
  statistical_analysis: z.string(),
  success_criteria: z.array(z.string()),
  failure_criteria: z.array(z.string()),
  data_quality_checks: z.array(z.string()),
  editable: z.literal(true)
});
export type Validation = z.infer<typeof ValidationSchema>;

export const RiskSchema = z.object({
  id: z.string(),
  risk: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  likelihood: z.enum(["low", "medium", "high"]),
  mitigation: z.string(),
  detection_signal: z.string(),
  editable: z.literal(true)
});
export type Risk = z.infer<typeof RiskSchema>;

export const AssumptionSchema = z.object({
  id: z.string(),
  assumption: z.string(),
  impact_if_wrong: z.string(),
  how_to_verify: z.string(),
  editable: z.literal(true)
});
export type Assumption = z.infer<typeof AssumptionSchema>;

export const SafetyComplianceSchema = z.object({
  overall_risk_level: z.enum(["low", "medium", "high"]),
  biosafety_level_assumption: z.string(),
  human_subjects_or_samples: z.string(),
  animal_work: z.string(),
  environmental_or_gmo_considerations: z.string(),
  required_approvals: z.array(z.string()),
  ppe: z.array(z.string()),
  waste_disposal: z.array(z.string()),
  critical_warnings: z.array(z.string()),
  expert_review_required: z.boolean()
});
export type SafetyCompliance = z.infer<typeof SafetyComplianceSchema>;

export const ExecutiveSummarySchema = z.object({
  objective: z.string(),
  experimental_strategy: z.string(),
  expected_result: z.string(),
  major_risks: z.array(z.string()),
  decision_gate: z.string()
});
export type ExecutiveSummary = z.infer<typeof ExecutiveSummarySchema>;

export const AppliedFeedbackEntrySchema = z.object({
  feedback_id: z.string(),
  derived_rule: z.string(),
  similarity_score: Confidence01,
  reason_applied: z.string(),
  source_item_type: z.string(),
  severity: z.enum(["minor", "important", "critical"])
});
export type AppliedFeedbackEntry = z.infer<typeof AppliedFeedbackEntrySchema>;

export const EvidenceQualitySchema = z.object({
  literature_coverage: z.enum(["low", "medium", "high"]),
  supplier_data_confidence: z.enum(["low", "medium", "high"]),
  protocol_grounding_confidence: z.enum(["low", "medium", "high"]),
  overall_plan_confidence: z.enum(["low", "medium", "high"]),
  known_gaps: z.array(z.string()),
  evidence_cards: z.array(EvidenceCardSchema)
});
export type EvidenceQuality = z.infer<typeof EvidenceQualitySchema>;

export const ExperimentPlanSchema = z.object({
  plan_id: z.string(),
  created_at: z.string(),
  hypothesis: z.object({
    raw: z.string(),
    parsed: ParsedHypothesisSchema
  }),
  novelty: z.object({
    signal: z.enum(["not_found", "similar_work_exists", "exact_match_found"]),
    confidence: Confidence01,
    rationale: z.string(),
    references: z.array(ReferenceSchema)
  }),
  applied_feedback: z.array(AppliedFeedbackEntrySchema),
  executive_summary: ExecutiveSummarySchema,
  safety_ethics_compliance: SafetyComplianceSchema,
  protocol: z.array(ProtocolStepSchema).min(3),
  materials: z.array(MaterialSchema),
  equipment: z.array(EquipmentSchema),
  budget: BudgetSchema,
  timeline: z.array(TimelinePhaseSchema).min(3),
  validation: ValidationSchema,
  risks_and_mitigations: z.array(RiskSchema),
  assumptions: z.array(AssumptionSchema),
  evidence_quality: EvidenceQualitySchema
});
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;

export const FeedbackScopeSchema = z.enum(["organization", "category", "experiment"]);
export type FeedbackScope = z.infer<typeof FeedbackScopeSchema>;

export const ScientistFeedbackSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  organization_id: z.string().default("default"),
  source_plan_id: z.string(),
  hypothesis: z.string(),
  parsed_hypothesis: ParsedHypothesisSchema.optional(),
  domain: z.string(),
  experiment_type: z.string(),
  category_id: z.string().nullable().optional(),
  scope: FeedbackScopeSchema.optional(),
  item_type: z.enum([
    "protocol",
    "material",
    "equipment",
    "budget",
    "timeline",
    "validation",
    "control",
    "safety",
    "risk",
    "assumption",
    "other"
  ]),
  item_id: z.string(),
  original_context: z.string(),
  correction: z.string(),
  reason: z.string(),
  rating_before: z.number().int().min(1).max(5).nullable().optional(),
  derived_rule: z.string(),
  applicable_rule: z.string().optional(),
  tags: z.array(z.string()),
  applicability: z.enum([
    "only_this_plan",
    "similar_experiment_type",
    "broad_rule"
  ]),
  severity: z.enum(["minor", "important", "critical"]),
  confidence: Confidence01,
  embedding: z.array(z.number()).optional(),
  embedding_model: z.string().optional()
});
export type ScientistFeedback = z.infer<typeof ScientistFeedbackSchema>;

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  created_at: z.string(),
  builtin: z.boolean().default(false)
});
export type Category = z.infer<typeof CategorySchema>;

export const CategoryListResponseSchema = z.object({
  ok: z.literal(true),
  organization_id: z.string(),
  categories: z.array(CategorySchema)
});
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

export const CategoryCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).optional()
});
export type CategoryCreateRequest = z.infer<typeof CategoryCreateRequestSchema>;

export const CategoryUpdateRequestSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(240).optional()
});
export type CategoryUpdateRequest = z.infer<typeof CategoryUpdateRequestSchema>;

export const LiteratureRequestSchema = z.object({
  hypothesis: NonEmptyString.min(20).max(3000)
});
export type LiteratureRequest = z.infer<typeof LiteratureRequestSchema>;

export const GeneratePlanRequestSchema = z.object({
  hypothesis: NonEmptyString.min(20).max(3000),
  literature_qc: LiteratureQCSchema,
  category_id: z.string().min(1).default("other"),
  continue_from_plan_id: z.string().min(1).nullable().optional(),
  organization_id: z.string().min(1).optional()
});
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>;

export const FeedbackCreateRequestSchema = z.object({
  source_plan_id: z.string().min(1),
  hypothesis: z.string().min(1),
  parsed_hypothesis: ParsedHypothesisSchema.optional(),
  domain: z.string().min(1),
  experiment_type: z.string().min(1),
  organization_id: z.string().min(1).optional(),
  category_id: z.string().min(1).nullable().optional(),
  scope: FeedbackScopeSchema.optional(),
  item_type: ScientistFeedbackSchema.shape.item_type,
  item_id: z.string().min(1),
  original_context: z.string().min(1),
  correction: z.string().min(1),
  reason: z.string().min(1),
  rating_before: z.number().int().min(1).max(5).nullable().optional(),
  tags: z.array(z.string()).default([]),
  applicability: ScientistFeedbackSchema.shape.applicability,
  severity: ScientistFeedbackSchema.shape.severity,
  confidence: Confidence01.default(0.7)
});
export type FeedbackCreateRequest = z.infer<typeof FeedbackCreateRequestSchema>;

export const SavedPlanSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  category_id: z.string().min(1),
  continue_from_plan_id: z.string().nullable().optional(),
  title: z.string().min(1).max(160),
  hypothesis: z.string().min(1),
  parsed_hypothesis: ParsedHypothesisSchema.optional(),
  literature_qc: LiteratureQCSchema,
  plan: ExperimentPlanSchema,
  generation: z
    .object({
      source: z.enum(["openai", "deterministic_fallback", "safety_restricted"]),
      model: z.string().nullable(),
      attempts: z.number().int().nonnegative(),
      errors: z.array(z.string())
    })
    .optional(),
  evidence: z
    .object({
      tavilyConfigured: z.boolean(),
      sourceStats: z.array(z.any()).optional(),
      regulatoryReasons: z.array(z.string()).optional(),
      cardCount: z.number().int().nonnegative().optional()
    })
    .optional(),
  critique: z.any().optional(),
  feedback_used: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string()
});
export type SavedPlan = z.infer<typeof SavedPlanSchema>;

export const SavedPlanSummarySchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  category_id: z.string(),
  title: z.string(),
  hypothesis_snippet: z.string(),
  domain: z.string().optional(),
  experiment_type: z.string().optional(),
  has_critique: z.boolean(),
  feedback_used_count: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string()
});
export type SavedPlanSummary = z.infer<typeof SavedPlanSummarySchema>;

export const PlanUpsertRequestSchema = z.object({
  id: z.string().min(1).optional(),
  category_id: z.string().min(1),
  continue_from_plan_id: z.string().nullable().optional(),
  title: z.string().min(1).max(160).optional(),
  hypothesis: z.string().min(1),
  parsed_hypothesis: ParsedHypothesisSchema.optional(),
  literature_qc: LiteratureQCSchema,
  plan: ExperimentPlanSchema,
  generation: SavedPlanSchema.shape.generation,
  evidence: SavedPlanSchema.shape.evidence,
  critique: SavedPlanSchema.shape.critique,
  feedback_used: z.array(z.string()).default([])
});
export type PlanUpsertRequest = z.infer<typeof PlanUpsertRequestSchema>;

export const PlanUpdateRequestSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  category_id: z.string().min(1).optional(),
  plan: ExperimentPlanSchema.optional(),
  critique: z.any().optional()
});
export type PlanUpdateRequest = z.infer<typeof PlanUpdateRequestSchema>;

export const FeedbackRetrieveRequestSchema = z.object({
  hypothesis: z.string().min(1),
  parsed_hypothesis: ParsedHypothesisSchema.optional(),
  limit: z.number().int().min(1).max(20).optional()
});
export type FeedbackRetrieveRequest = z.infer<typeof FeedbackRetrieveRequestSchema>;

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  timestamp: z.string(),
  env: z.object({
    openaiConfigured: z.boolean(),
    openaiModel: z.string().optional(),
    tavilyConfigured: z.boolean(),
    semanticScholarConfigured: z.boolean(),
    demoFallbackEnabled: z.boolean(),
    nodeVersion: z.string().optional(),
    runtime: z.string().optional(),
    vercel: z
      .object({
        onVercel: z.boolean(),
        env: z.enum(["production", "preview", "development"]).nullable(),
        url: z.string().nullable(),
        region: z.string().nullable(),
        gitCommitSha: z.string().nullable(),
        gitCommitShortSha: z.string().nullable(),
        gitCommitRef: z.string().nullable(),
        gitProvider: z.string().nullable(),
        gitRepoOwner: z.string().nullable(),
        gitRepoSlug: z.string().nullable()
      })
      .optional()
  }),
  feedbackStore: z.object({
    exists: z.boolean(),
    count: z.number().int().nonnegative(),
    readable: z.boolean()
  })
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const RetrievedFeedbackSchema = z.object({
  feedback: ScientistFeedbackSchema,
  similarity_score: Confidence01,
  reason: z.string()
});
export type RetrievedFeedback = z.infer<typeof RetrievedFeedbackSchema>;
