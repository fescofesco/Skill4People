import { deleteCategory, updateCategory } from "@/lib/category-store";
import { readOrganizationId } from "@/lib/org-server";
import { CategoryUpdateRequestSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PUT(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    const body = validate(CategoryUpdateRequestSchema, await req.json());
    const updated = await updateCategory(organizationId, params.id, body);
    return Response.json({ ok: true, organization_id: organizationId, category: updated });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    await deleteCategory(organizationId, params.id);
    return Response.json({ ok: true, organization_id: organizationId, deleted: params.id });
  } catch (err) {
    return jsonError(err);
  }
}
