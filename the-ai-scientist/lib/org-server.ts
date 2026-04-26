import { DEFAULT_ORGANIZATION_ID } from "./org-constants";

/**
 * Pull the active organization id from a request. Precedence:
 *   1. `x-organization-id` header (set by apiFetch on the client).
 *   2. `organization_id` field in the JSON body, if provided.
 *   3. The default organization (`"default"`).
 *
 * The body argument is optional so callers can resolve the org id before
 * even parsing the body. Strings are normalized lightly so a stray
 * whitespace doesn't create a separate org.
 */
export function readOrganizationId(req: Request, body?: { organization_id?: unknown } | null): string {
  const fromHeader = req.headers.get("x-organization-id");
  if (typeof fromHeader === "string" && fromHeader.trim()) {
    return normalizeOrgId(fromHeader);
  }
  if (body && typeof body.organization_id === "string" && body.organization_id.trim()) {
    return normalizeOrgId(body.organization_id);
  }
  return DEFAULT_ORGANIZATION_ID;
}

export function normalizeOrgId(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!cleaned) return DEFAULT_ORGANIZATION_ID;
  return cleaned.slice(0, 64);
}

export { DEFAULT_ORGANIZATION_ID };
