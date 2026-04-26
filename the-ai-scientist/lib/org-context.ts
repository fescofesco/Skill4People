"use client";

import { useEffect, useState } from "react";
import { DEFAULT_ORGANIZATION_ID, ORG_STORAGE_KEY } from "./org-constants";

const STORAGE_KEY = ORG_STORAGE_KEY;
export { DEFAULT_ORGANIZATION_ID };

/**
 * Normalize free-text into a stable, file/header-safe organization id
 * (lowercase letters, digits, hyphens). The display label is whatever the
 * user typed, but the ID we send to the server is normalized.
 */
export function slugifyOrganizationId(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return DEFAULT_ORGANIZATION_ID;
  return normalized.slice(0, 64);
}

export function getOrganizationId(): string {
  if (typeof window === "undefined") return DEFAULT_ORGANIZATION_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ORGANIZATION_ID;
    return slugifyOrganizationId(raw);
  } catch {
    return DEFAULT_ORGANIZATION_ID;
  }
}

export function setOrganizationId(value: string): string {
  if (typeof window === "undefined") return DEFAULT_ORGANIZATION_ID;
  const normalized = slugifyOrganizationId(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, normalized);
    window.dispatchEvent(
      new CustomEvent("ai-scientist:organization-change", { detail: normalized })
    );
  } catch {
    // Ignore quota errors; fall back to in-memory only.
  }
  return normalized;
}

/**
 * React hook that re-renders when the active organization changes
 * (either via setOrganizationId in this tab, or via storage events
 * from other tabs).
 */
export function useOrganization(): { organizationId: string; setOrganization: (v: string) => void } {
  const [organizationId, setOrgState] = useState<string>(() =>
    typeof window === "undefined" ? DEFAULT_ORGANIZATION_ID : getOrganizationId()
  );

  useEffect(() => {
    const onCustom = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (typeof next === "string") setOrgState(next);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setOrgState(getOrganizationId());
      }
    };
    window.addEventListener("ai-scientist:organization-change", onCustom);
    window.addEventListener("storage", onStorage);
    setOrgState(getOrganizationId());
    return () => {
      window.removeEventListener("ai-scientist:organization-change", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    organizationId,
    setOrganization: (value: string) => {
      const normalized = setOrganizationId(value);
      setOrgState(normalized);
    }
  };
}
