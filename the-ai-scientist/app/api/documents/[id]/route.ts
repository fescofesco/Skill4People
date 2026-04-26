import { deleteDocument, getDocument, toSummary } from "@/lib/document-store";
import { readOrganizationId } from "@/lib/org-server";
import { HttpError, jsonError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    const url = new URL(req.url);
    const includeText = url.searchParams.get("text") === "1";

    const doc = await getDocument(params.id);
    if (!doc) {
      throw new HttpError({
        status: 404,
        code: "DOCUMENT_NOT_FOUND",
        message: `Document ${params.id} not found.`,
        recoverable: true
      });
    }
    if (doc.organization_id !== organizationId) {
      throw new HttpError({
        status: 403,
        code: "DOCUMENT_WRONG_ORG",
        message: "This document belongs to a different organization.",
        recoverable: false
      });
    }
    if (includeText) {
      return Response.json({ ok: true, document: doc });
    }
    return Response.json({ ok: true, document: toSummary(doc) });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  try {
    const organizationId = readOrganizationId(req);
    const doc = await getDocument(params.id);
    if (!doc) return Response.json({ ok: true, deleted: false });
    if (doc.organization_id !== organizationId) {
      throw new HttpError({
        status: 403,
        code: "DOCUMENT_WRONG_ORG",
        message: "This document belongs to a different organization.",
        recoverable: false
      });
    }
    const deleted = await deleteDocument(params.id);
    return Response.json({ ok: true, deleted });
  } catch (err) {
    return jsonError(err);
  }
}
