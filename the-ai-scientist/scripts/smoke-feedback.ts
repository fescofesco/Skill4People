import "./load-env";
import { classifyFeedbackRule } from "../lib/feedback-prompts";
import { getActiveFeedbackContext } from "../lib/feedback-retrieval";
import { listCategories } from "../lib/category-store";
import { listPlanSummaries } from "../lib/plan-store";

type Fixture = {
  label: string;
  input: Parameters<typeof classifyFeedbackRule>[0];
  expectedScope?: "organization" | "category" | "experiment";
};

const FIXTURES: Fixture[] = [
  {
    label: "org-wide policy",
    expectedScope: "organization",
    input: {
      original_context: "Material list: solvents from Generic Vendor",
      correction: "Always order DMSO from Sigma-Aldrich for our lab — that's our standing supplier policy.",
      reason: "Lab policy locked to Sigma for solvents.",
      item_type: "material",
      domain: "biology",
      experiment_type: "in vitro assay",
      tags: ["supplier", "policy"],
      applicability: "broad_rule",
      severity: "important",
      organization_id: "smoke",
      category_id: null,
      category_name: null
    }
  },
  {
    label: "category rule (colloidal synthesis)",
    expectedScope: "category",
    input: {
      original_context: "Validation block: characterize particles by TEM only",
      correction:
        "For any colloidal nanoparticle synthesis, also confirm DLS PDI < 0.2 before assuming a monodisperse population.",
      reason: "Standard QC step for colloidal work in this lab.",
      item_type: "validation",
      domain: "materials",
      experiment_type: "colloidal synthesis",
      tags: ["dls", "qc"],
      applicability: "similar_experiment_type",
      severity: "important",
      organization_id: "smoke",
      category_id: "colloidal_synthesis",
      category_name: "Colloidal synthesis"
    }
  },
  {
    label: "experiment-only tweak",
    expectedScope: "experiment",
    input: {
      original_context: "Protocol step 2: Reduce Pd-Cu nanoparticles for 2 hours",
      correction: "For our specific Pd-Cu nanoparticle CO2 reduction setup with this batch ratio, use a 4-hour reduction.",
      reason: "Empirical optimum for this specific catalyst chemistry.",
      item_type: "protocol",
      domain: "chemistry",
      experiment_type: "electrocatalysis",
      tags: ["reduction", "duration"],
      applicability: "only_this_plan",
      severity: "minor",
      organization_id: "smoke",
      category_id: "chemical_synthesis",
      category_name: "Chemical synthesis"
    }
  }
];

async function main() {
  const results: Record<string, unknown>[] = [];
  for (const fx of FIXTURES) {
    const classified = await classifyFeedbackRule(fx.input);
    const ok =
      typeof classified.applicable_rule === "string" &&
      classified.applicable_rule.length > 4 &&
      typeof classified.derived_rule === "string" &&
      classified.derived_rule.length > 4 &&
      ["organization", "category", "experiment"].includes(classified.scope);
    if (!ok) {
      throw new Error(`Classification missing required fields for "${fx.label}"`);
    }
    results.push({
      fixture: fx.label,
      expected: fx.expectedScope ?? null,
      actual_scope: classified.scope,
      applicable_rule: classified.applicable_rule,
      tags: classified.normalized_tags
    });
  }

  // Sanity-check that the org-scoped store endpoints function in-process
  // even without a network call.
  const cats = await listCategories("smoke");
  const plans = await listPlanSummaries({ organization_id: "smoke" });

  // Retrieval round-trip should work without throwing even if no rules
  // exist for the smoke org yet.
  const ctx = await getActiveFeedbackContext({
    organization_id: "smoke",
    category_id: "other",
    hypothesis: FIXTURES[0].input.correction
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        fixtures: results,
        smokeCategoriesCount: cats.length,
        smokePlanCount: plans.length,
        retrievalBuckets: {
          organization: ctx.organization_rules.length,
          category: ctx.category_rules.length,
          experiment: ctx.experiment_rules.length
        }
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
