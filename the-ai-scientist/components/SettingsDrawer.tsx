"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api-client";
import { slugifyOrganizationId, useOrganization } from "@/lib/org-context";
import type { Category } from "@/lib/schemas";
import { DocumentManager } from "./DocumentManager";

type Props = {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  onCategoriesChange: (next: Category[]) => void;
};

/**
 * Side drawer that lets the user rename their active organisation and
 * curate the per-organisation category list. The organisation id lives in
 * localStorage; categories are server-stored under
 * `data/category_store.json` and reloaded after every mutation.
 */
export function SettingsDrawer({ open, onClose, categories, onCategoriesChange }: Props) {
  const { organizationId, setOrganization } = useOrganization();
  const [orgInput, setOrgInput] = useState(organizationId);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrgInput(organizationId);
  }, [organizationId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const orgPreview = slugifyOrganizationId(orgInput);

  async function reloadCategories() {
    try {
      const res = await apiJson<{ categories: Category[] }>("/api/categories");
      onCategoriesChange(res.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload categories");
    }
  }

  async function commitCategoryRename(id: string) {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/categories/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() })
      });
      await reloadCategories();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/categories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() })
      });
      setNewName("");
      await reloadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create category");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(id: string) {
    if (!confirm("Delete this category? Plans tagged to it will keep their existing tag.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson(`/api/categories/${id}`, { method: "DELETE" });
      await reloadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function commitOrg() {
    const next = slugifyOrganizationId(orgInput);
    setOrganization(next);
    void reloadCategories();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="grow bg-slate-950/40 backdrop-blur-sm" />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Settings</h2>
            <p className="text-xs text-slate-500">
              Active org: <span className="font-mono text-slate-700">{organizationId}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section>
            <h3 className="text-sm font-semibold text-slate-900">Organization</h3>
            <p className="mt-1 text-xs text-slate-500">
              Feedback rules and saved experiments are scoped per organisation. Switching this
              changes which rules guide plan generation.
            </p>
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Organization name
            </label>
            <input
              value={orgInput}
              onChange={(e) => setOrgInput(e.target.value)}
              placeholder="e.g. acme-bio-lab"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>
                Stored as: <span className="font-mono text-slate-700">{orgPreview}</span>
              </span>
              <button
                type="button"
                onClick={commitOrg}
                disabled={orgPreview === organizationId}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Experiment categories</h3>
              <span className="text-xs text-slate-500">{categories.length}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              These appear in the hypothesis input and feedback override. Built-in categories
              cannot be deleted but can be renamed.
            </p>
            <ul className="mt-3 space-y-2">
              {categories.map((cat) => (
                <li
                  key={cat.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="min-w-0 grow">
                    {editingId === cat.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitCategoryRename(cat.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitCategoryRename(cat.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded-lg border border-blue-200 bg-white p-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(cat.id);
                          setEditingName(cat.name);
                        }}
                        className="block w-full text-left"
                      >
                        <div className="text-sm font-medium text-slate-900">{cat.name}</div>
                        <div className="font-mono text-xs text-slate-500">{cat.id}</div>
                        {cat.description && (
                          <div className="mt-1 text-xs text-slate-600">{cat.description}</div>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {cat.builtin ? (
                      <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                        builtin
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeCategory(cat.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" /> delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addCategory();
                }}
                placeholder="New category name"
                className="grow rounded-xl border border-slate-300 bg-white p-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={addCategory}
                disabled={busy || !newName.trim()}
                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </section>

          <DocumentManager scope="organization" />

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
