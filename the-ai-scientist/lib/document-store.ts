import { promises as fs } from "fs";
import path from "path";
import { DocumentRecord, DocumentRecordSchema, DocumentSummary, DocumentScope } from "./schemas";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "document_store.json");

const PREVIEW_LENGTH = 280;

async function ensureStore(): Promise<void> {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
  } catch {
    // ignore — directory creation is best-effort
  }
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, "[]\n", "utf8");
  }
}

let writeLock: Promise<void> = Promise.resolve();

export async function readAllDocuments(): Promise<DocumentRecord[]> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const valid: DocumentRecord[] = [];
  for (const entry of parsed) {
    const result = DocumentRecordSchema.safeParse(entry);
    if (result.success) valid.push(result.data);
  }
  return valid;
}

async function persist(items: DocumentRecord[]): Promise<void> {
  const next = writeLock.then(async () => {
    const tmp = STORE_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
    await fs.rename(tmp, STORE_FILE);
  });
  writeLock = next.catch(() => undefined);
  await next;
}

export async function appendDocument(item: DocumentRecord): Promise<DocumentRecord> {
  const validated = DocumentRecordSchema.parse(item);
  const next = writeLock.then(async () => {
    const all = await readAllDocuments();
    all.push(validated);
    const tmp = STORE_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(all, null, 2) + "\n", "utf8");
    await fs.rename(tmp, STORE_FILE);
  });
  writeLock = next.catch(() => undefined);
  await next;
  return validated;
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  const all = await readAllDocuments();
  return all.find((d) => d.id === id) ?? null;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const all = await readAllDocuments();
  const next = all.filter((d) => d.id !== id);
  if (next.length === all.length) return false;
  await persist(next);
  return true;
}

export type ListDocumentsArgs = {
  organization_id: string;
  scope?: DocumentScope;
  plan_id?: string | null;
};

/**
 * Returns server-side documents matching the given org and (optionally)
 * scope/plan. Used by both the listing endpoint and the plan generator —
 * the planner pulls organization docs (always) and experiment docs scoped
 * to the active `continue_from_plan_id` (when provided).
 */
export async function listDocuments(args: ListDocumentsArgs): Promise<DocumentRecord[]> {
  const all = await readAllDocuments();
  return all.filter((d) => {
    if (d.organization_id !== args.organization_id) return false;
    if (args.scope && d.scope !== args.scope) return false;
    if (args.plan_id !== undefined && args.plan_id !== null) {
      if (d.scope !== "experiment") return false;
      if (d.plan_id !== args.plan_id) return false;
    }
    return true;
  });
}

export function toSummary(doc: DocumentRecord): DocumentSummary {
  const cleaned = doc.text.replace(/\s+/g, " ").trim();
  return {
    id: doc.id,
    organization_id: doc.organization_id,
    scope: doc.scope,
    plan_id: doc.plan_id,
    filename: doc.filename,
    content_type: doc.content_type,
    byte_size: doc.byte_size,
    page_count: doc.page_count ?? null,
    truncated: doc.truncated,
    text_length: doc.text.length,
    text_preview: cleaned.slice(0, PREVIEW_LENGTH),
    created_at: doc.created_at,
    updated_at: doc.updated_at
  };
}

export function getDocumentStorePath(): string {
  return STORE_FILE;
}
