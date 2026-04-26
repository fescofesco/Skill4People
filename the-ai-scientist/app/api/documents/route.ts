import { Buffer } from "buffer";
import { appendDocument, listDocuments, toSummary } from "@/lib/document-store";
import { extractDocumentText, UnsupportedFileError } from "@/lib/document-extract";
import { newId } from "@/lib/ids";
import { readOrganizationId } from "@/lib/org-server";
import { getPlan } from "@/lib/plan-store";
import {
  DocumentRecord,
  DocumentRecordSchema,
  DocumentScopeSchema
} from "@/lib/schemas";
import { HttpError, jsonError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function GET(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const url = new URL(req.url);
    const scopeParam = url.searchParams.get("scope");
    const planId = url.searchParams.get("plan_id");

    const scope = scopeParam
      ? DocumentScopeSchema.parse(scopeParam)
      : undefined;

    const docs = await listDocuments({
      organization_id: organizationId,
      scope,
      plan_id: planId || undefined
    });

    return Response.json({
      ok: true,
      organization_id: organizationId,
      scope: scope ?? null,
      plan_id: planId || null,
      documents: docs.map(toSummary)
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request) {
  try {
    const organizationId = readOrganizationId(req);
    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().startsWith("multipart/form-data")) {
      throw new HttpError({
        status: 400,
        code: "DOCUMENT_BAD_REQUEST",
        message: "Use multipart/form-data with a 'file' field.",
        recoverable: true
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    const scopeRaw = (form.get("scope") || "organization").toString();
    const planId = (form.get("plan_id") || "").toString().trim() || null;

    if (!(file instanceof File)) {
      throw new HttpError({
        status: 400,
        code: "DOCUMENT_NO_FILE",
        message: "No file uploaded under the 'file' field.",
        recoverable: true
      });
    }

    if (file.size > MAX_BYTES) {
      throw new HttpError({
        status: 413,
        code: "DOCUMENT_TOO_LARGE",
        message: `File exceeds ${MAX_BYTES / (1024 * 1024)} MB limit.`,
        recoverable: true
      });
    }

    const scopeParsed = DocumentScopeSchema.safeParse(scopeRaw);
    if (!scopeParsed.success) {
      throw new HttpError({
        status: 400,
        code: "DOCUMENT_BAD_SCOPE",
        message: "scope must be 'organization' or 'experiment'.",
        recoverable: true
      });
    }
    const scope = scopeParsed.data;

    if (scope === "experiment") {
      if (!planId) {
        throw new HttpError({
          status: 400,
          code: "DOCUMENT_PLAN_REQUIRED",
          message: "Experiment-scoped uploads require plan_id.",
          recoverable: true
        });
      }
      const plan = await getPlan(planId);
      if (!plan) {
        throw new HttpError({
          status: 404,
          code: "DOCUMENT_PLAN_NOT_FOUND",
          message: `Plan ${planId} not found — save the plan before attaching documents.`,
          recoverable: true
        });
      }
      if (plan.organization_id !== organizationId) {
        throw new HttpError({
          status: 403,
          code: "DOCUMENT_PLAN_WRONG_ORG",
          message: "This plan belongs to a different organization.",
          recoverable: false
        });
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extracted;
    try {
      extracted = await extractDocumentText({
        buffer,
        filename: file.name || "upload",
        contentType: file.type || ""
      });
    } catch (err) {
      if (err instanceof UnsupportedFileError) {
        throw new HttpError({
          status: 415,
          code: "DOCUMENT_UNSUPPORTED",
          message: err.message,
          recoverable: true
        });
      }
      throw new HttpError({
        status: 422,
        code: "DOCUMENT_EXTRACT_FAILED",
        message: err instanceof Error ? err.message : "Failed to extract text from file.",
        recoverable: true
      });
    }

    const now = new Date().toISOString();
    const record: DocumentRecord = DocumentRecordSchema.parse({
      id: newId("doc"),
      organization_id: organizationId,
      scope,
      plan_id: scope === "experiment" ? planId : null,
      filename: file.name || "upload",
      content_type: extracted.content_type,
      byte_size: file.size,
      text: extracted.text,
      page_count: extracted.page_count,
      truncated: extracted.truncated,
      created_at: now,
      updated_at: now
    });

    await appendDocument(record);

    return Response.json({
      ok: true,
      organization_id: organizationId,
      document: toSummary(record)
    });
  } catch (err) {
    return jsonError(err);
  }
}
