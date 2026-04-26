import { readOrganizationId } from "@/lib/org-server";
import { deletePlan, getPlan, updatePlan } from "@/lib/plan-store";
import { PlanUpdateRequestSchema } from "@/lib/schemas";
import { HttpError, jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    const plan = await getPlan(params.id);
    if (!plan) {
      throw new HttpError({
        status: 404,
        code: "PLAN_NOT_FOUND",
        message: `Plan ${params.id} not found`,
        recoverable: true
      });
    }
    if (plan.organization_id !== organizationId) {
      throw new HttpError({
        status: 403,
        code: "PLAN_WRONG_ORG",
        message: "This plan belongs to a different organization.",
        recoverable: false
      });
    }
    return Response.json({ ok: true, plan });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    const existing = await getPlan(params.id);
    if (!existing) {
      throw new HttpError({
        status: 404,
        code: "PLAN_NOT_FOUND",
        message: `Plan ${params.id} not found`,
        recoverable: true
      });
    }
    if (existing.organization_id !== organizationId) {
      throw new HttpError({
        status: 403,
        code: "PLAN_WRONG_ORG",
        message: "This plan belongs to a different organization.",
        recoverable: false
      });
    }
    const patch = validate(PlanUpdateRequestSchema, await req.json());
    const updated = await updatePlan(params.id, patch);
    return Response.json({ ok: true, plan: updated });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    const existing = await getPlan(params.id);
    if (!existing) {
      return Response.json({ ok: true, deleted: false });
    }
    if (existing.organization_id !== organizationId) {
      throw new HttpError({
        status: 403,
        code: "PLAN_WRONG_ORG",
        message: "This plan belongs to a different organization.",
        recoverable: false
      });
    }
    const deleted = await deletePlan(params.id);
    return Response.json({ ok: true, deleted });
  } catch (err) {
    return jsonError(err);
  }
}
