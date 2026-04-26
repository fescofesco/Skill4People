"use client";

import { getOrganizationId } from "./org-context";

/**
 * Wraps fetch so that every request from the client carries the
 * `x-organization-id` header. Server routes use this header (with an
 * optional body fallback) to scope reads/writes by organization.
 *
 * Usage mirrors fetch exactly: apiFetch(url, { method, body, ... }).
 */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("x-organization-id")) {
    headers.set("x-organization-id", getOrganizationId());
  }
  return fetch(input, { ...init, headers });
}

export async function apiJson<T = unknown>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response from ${String(input)} (status ${res.status})`);
  }
  if (!res.ok) {
    const message = parsed?.error?.message || parsed?.message || `Request failed with status ${res.status}`;
    const error = new Error(message) as Error & { status?: number; details?: unknown; code?: string };
    error.status = res.status;
    error.details = parsed?.error?.details ?? parsed;
    error.code = parsed?.error?.code;
    throw error;
  }
  return parsed as T;
}
