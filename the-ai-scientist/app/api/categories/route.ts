import { createCategory, listCategories } from "@/lib/category-store";
import { readOrganizationId } from "@/lib/org-server";
import { CategoryCreateRequestSchema } from "@/lib/schemas";
import { jsonError, validate } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const categories = await listCategories(organizationId);
    return Response.json({ ok: true, organization_id: organizationId, categories });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const body = validate(CategoryCreateRequestSchema, await req.json());
    const created = await createCategory(organizationId, body);
    return Response.json({ ok: true, organization_id: organizationId, category: created });
  } catch (err) {
    return jsonError(err);
  }
}
