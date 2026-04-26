"use client";

import { FileText, Loader2, Paperclip, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, apiJson } from "@/lib/api-client";
import type { DocumentScope, DocumentSummary } from "@/lib/schemas";

type Props = {
  scope: DocumentScope;
  planId?: string | null;
  /**
   * Title shown above the list. Defaults are scope-appropriate:
   *  - organization → "Organization documents"
   *  - experiment   → "Experiment documents"
   */
  title?: string;
  helperText?: string;
  /** Hide the header so this can be embedded inside a card that already has one. */
  compact?: boolean;
  /**
   * Disabled state for experiment uploads when the plan hasn't been saved yet
   * (saved plan id required so the document can be linked to a row in the
   * plan store).
   */
  disabledReason?: string | null;
};

const ACCEPT = ".pdf,.txt,.md,application/pdf,text/plain,text/markdown";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function DocumentManager({
  scope,
  planId,
  title,
  helperText,
  compact = false,
  disabledReason
}: Props) {
  const [items, setItems] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isDisabled = scope === "experiment" && (!planId || Boolean(disabledReason));

  const refresh = useCallback(async () => {
    if (isDisabled) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (scope === "experiment" && planId) params.set("plan_id", planId);
      const res = await apiJson<{ documents: DocumentSummary[] }>(
        `/api/documents?${params.toString()}`
      );
      setItems(res.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [scope, planId, isDisabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      setError(null);
      try {
        for (const file of Array.from(files)) {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("scope", scope);
          if (scope === "experiment" && planId) fd.append("plan_id", planId);
          const res = await apiFetch("/api/documents", { method: "POST", body: fd });
          if (!res.ok) {
            const txt = await res.text();
            let msg = `Upload failed (${res.status})`;
            try {
              const parsed = JSON.parse(txt);
              msg = parsed?.error?.message || msg;
            } catch {
              // ignore
            }
            throw new Error(msg);
          }
        }
        await refresh();
        if (inputRef.current) inputRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(false);
      }
    },
    [scope, planId, refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!confirm("Delete this document? It will no longer be added to plan generation.")) return;
      setError(null);
      try {
        await apiJson(`/api/documents/${id}`, { method: "DELETE" });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed.");
      }
    },
    [refresh]
  );

  const headerTitle = title || (scope === "organization" ? "Organization documents" : "Experiment documents");
  const headerHelper =
    helperText ||
    (scope === "organization"
      ? "PDFs and text files added here are injected into every plan as ORGANIZATION DOCUMENTS."
      : "PDFs and text files attached here are injected into plans that continue from this experiment as EXPERIMENT DOCUMENTS.");

  return (
    <section>
      {!compact && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">{headerTitle}</h3>
          <span className="text-xs text-slate-500">{items.length}</span>
        </div>
      )}
      {!compact && <p className="mt-1 text-xs text-slate-500">{headerHelper}</p>}

      {isDisabled ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
          {disabledReason ||
            "Save the plan first (it auto-saves once generated) to attach experiment documents."}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={(e) => handleFiles(e.target.files)}
            disabled={uploading}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload PDF or TXT"}
          </button>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {!loading && items.length === 0 && !isDisabled && (
          <li className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
            No documents uploaded yet.
          </li>
        )}
        {items.map((doc) => (
          <li
            key={doc.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="min-w-0 grow">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <FileText className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="truncate">{doc.filename}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>{fmtBytes(doc.byte_size)}</span>
                {doc.page_count ? <span>{doc.page_count} pages</span> : null}
                <span>{doc.text_length.toLocaleString()} chars</span>
                {doc.truncated && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">
                    truncated
                  </span>
                )}
              </div>
              {doc.text_preview && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{doc.text_preview}…</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(doc.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              aria-label={`Delete ${doc.filename}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}
    </section>
  );
}

DocumentManager.icons = { Paperclip };
