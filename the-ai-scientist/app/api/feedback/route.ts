import { getCategory, listCategories } from "@/lib/category-store";
import { classifyFeedbackRule } from "@/lib/feedback-prompts";
import { appendFeedback, readAllFeedback } from "@/lib/feedback-store";
import { newFeedbackId } from "@/lib/ids";
import { safeEmbedding } from "@/lib/openai";
import { readOrganizationId } from "@/lib/org-server";
import { FeedbackCreateRequestSchema, ScientistFeedbackSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const url = new URL(req.url);
    const all = await readAllFeedback();
    const filtered = url.searchParams.get("all") === "1"
      ? all
      : all.filter((f) => (f.organization_id || "default") === organizationId);
    return Response.json({
      ok: true,
      organization_id: organizationId,
      count: filtered.length,
      feedback: filtered
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const organizationId = readOrganizationId(req, json);
    const body = validate(FeedbackCreateRequestSchema, json);
    const tags = body.tags ?? [];

    // Resolve the category id and look up the display name so the
    // classifier can decide whether a rule generalises to the whole
    // category or only this experiment. If the user picked a category id
    // that no longer exists for this org, fall back to "other".
    let categoryId = body.category_id || null;
    let categoryName: string | null = null;
    if (categoryId) {
      const found = await getCategory(organizationId, categoryId);
      if (found) {
        categoryName = found.name;
      } else {
        const all = await listCategories(organizationId);
        const fallback = all.find((c) => c.id === "other") || all[0];
        categoryId = fallback?.id || "other";
        categoryName = fallback?.name || "Other";
      }
    }

    const classified = await classifyFeedbackRule({
      original_context: body.original_context,
      correction: body.correction,
      reason: body.reason,
      item_type: body.item_type,
      domain: body.domain,
      experiment_type: body.experiment_type,
      tags,
      applicability: body.applicability,
      severity: body.severity,
      organization_id: organizationId,
      category_id: categoryId,
      category_name: categoryName
    });

    // The user can pre-classify (via the UI override chips); honour that
    // unless they selected "category" without providing a category_id.
    let scope = body.scope || classified.scope;
    if (scope === "category" && !categoryId) scope = "experiment";

    // Embedding is on the imperative directive so retrieval pulls the
    // most prompt-ready text rather than the raw user prose.
    const embeddingText = [
      classified.applicable_rule,
      classified.derived_rule,
      tags.join(" "),
      body.domain,
      body.experiment_type,
      body.item_type,
      categoryName ?? ""
    ]
      .filter(Boolean)
      .join("\n");
    const embedding = await safeEmbedding(embeddingText);

    const feedback = ScientistFeedbackSchema.parse({
      id: newFeedbackId(),
      created_at: new Date().toISOString(),
      organization_id: organizationId,
      source_plan_id: body.source_plan_id,
      hypothesis: body.hypothesis,
      parsed_hypothesis: body.parsed_hypothesis,
      domain: body.domain,
      experiment_type: body.experiment_type,
      category_id: categoryId,
      scope,
      item_type: body.item_type,
      item_id: body.item_id,
      original_context: body.original_context,
      correction: body.correction,
      reason: body.reason,
      rating_before: body.rating_before,
      derived_rule: classified.derived_rule,
      applicable_rule: classified.applicable_rule,
      tags: classified.normalized_tags.length ? classified.normalized_tags : tags,
      applicability: classified.suggested_applicability || body.applicability,
      severity: body.severity,
      confidence: body.confidence,
      embedding: embedding?.vector,
      embedding_model: embedding?.model
    });

    await appendFeedback(feedback);
    return Response.json({
      ok: true,
      feedback,
      classification: {
        scope: feedback.scope,
        category_id: feedback.category_id,
        applicable_rule: feedback.applicable_rule
      }
    });
  } catch (err) {
    return jsonError(err);
  }
}
