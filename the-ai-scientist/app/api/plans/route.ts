import { listCategories, getCategory } from "@/lib/category-store";
import { readOrganizationId } from "@/lib/org-server";
import { listPlanSummaries, upsertPlan } from "@/lib/plan-store";
import { PlanUpsertRequestSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";
import { truncate } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const url = new URL(req.url);
    const categoryId = url.searchParams.get("category_id") || undefined;
    const summaries = await listPlanSummaries({
      organization_id: organizationId,
      category_id: categoryId
    });
    return Response.json({
      ok: true,
      organization_id: organizationId,
      category_id: categoryId ?? null,
      plans: summaries
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const body = validate(PlanUpsertRequestSchema, await req.json());

    // Make sure the category exists for this org. If a stale id is sent
    // (e.g. user deleted it in another tab) fall back to "other" rather
    // than 400-ing — the saved plan still works, the UI just shows it
    // under Other.
    const cat = await getCategory(organizationId, body.category_id);
    let categoryId = body.category_id;
    if (!cat) {
      const all = await listCategories(organizationId);
      categoryId = all.find((c) => c.id === "other")?.id || all[0]?.id || "other";
    }

    const title =
      body.title?.trim() ||
      (body.parsed_hypothesis?.intervention?.trim()) ||
      truncate(body.hypothesis.replace(/\s+/g, " "), 80);

    const saved = await upsertPlan({
      id: body.id,
      organization_id: organizationId,
      category_id: categoryId,
      continue_from_plan_id: body.continue_from_plan_id ?? null,
      title,
      hypothesis: body.hypothesis,
      parsed_hypothesis: body.parsed_hypothesis,
      literature_qc: body.literature_qc,
      plan: body.plan,
      generation: body.generation,
      evidence: body.evidence,
      critique: body.critique,
      feedback_used: body.feedback_used ?? []
    });

    return Response.json({ ok: true, organization_id: organizationId, plan: saved });
  } catch (err) {
    return jsonError(err);
  }
}
