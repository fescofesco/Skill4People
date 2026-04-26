import { promises as fs } from "fs";
import path from "path";
import { ScientistFeedback, ScientistFeedbackSchema } from "./schemas";
import { DEFAULT_ORGANIZATION_ID } from "./org-constants";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "feedback_store.json");

/**
 * Backfill the new three-bucket fields on legacy entries that were saved
 * before the schema had `organization_id`, `scope`, `category_id`, or
 * `applicable_rule`. The mapping uses the legacy `applicability` to pick
 * a sane default scope, leaves `category_id` null (it will be applied at
 * the org/experiment level until the user re-tags it), and defaults
 * `applicable_rule` to whatever `derived_rule` already has so retrieval
 * still works on the imperative path.
 */
function migrateLegacyEntry(entry: any): any {
  if (!entry || typeof entry !== "object") return entry;
  const next = { ...entry };
  if (typeof next.organization_id !== "string" || next.organization_id.length === 0) {
    next.organization_id = DEFAULT_ORGANIZATION_ID;
  }
  if (!next.scope) {
    if (next.applicability === "broad_rule") next.scope = "organization";
    else if (next.applicability === "similar_experiment_type") next.scope = "category";
    else next.scope = "experiment";
  }
  if (next.category_id === undefined) {
    next.category_id = null;
  }
  if (typeof next.applicable_rule !== "string" || next.applicable_rule.length === 0) {
    if (typeof next.derived_rule === "string" && next.derived_rule.length > 0) {
      next.applicable_rule = next.derived_rule;
    }
  }
  return next;
}

async function ensureStore(): Promise<void> {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
  } catch {
    // ignore
  }
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, "[]\n", "utf8");
  }
}

export async function feedbackStoreStatus(): Promise<{
  exists: boolean;
  count: number;
  readable: boolean;
}> {
  try {
    await ensureStore();
    const items = await readAllFeedback();
    return { exists: true, count: items.length, readable: true };
  } catch {
    return { exists: false, count: 0, readable: false };
  }
}

let migrationDone = false;

export async function readAllFeedback(): Promise<ScientistFeedback[]> {
  await ensureStore();
  const raw = await fs.readFile(STORE_FILE, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await quarantineCorrupt(raw);
    return [];
  }
  if (!Array.isArray(parsed)) {
    await quarantineCorrupt(raw);
    return [];
  }
  const valid: ScientistFeedback[] = [];
  let needsMigration = false;
  for (const entry of parsed) {
    const original = entry && typeof entry === "object" ? entry : null;
    const beforeMissing =
      !original ||
      typeof original.organization_id !== "string" ||
      !original.scope ||
      original.category_id === undefined ||
      typeof original.applicable_rule !== "string";
    const migrated = migrateLegacyEntry(entry);
    if (beforeMissing) needsMigration = true;
    const result = ScientistFeedbackSchema.safeParse(migrated);
    if (result.success) valid.push(result.data);
  }
  if (needsMigration && !migrationDone) {
    migrationDone = true;
    void persistMigratedEntries(valid).catch(() => {
      migrationDone = false;
    });
  }
  return valid;
}

async function persistMigratedEntries(items: ScientistFeedback[]): Promise<void> {
  const next = writeLock.then(async () => {
    const tmp = STORE_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
    await fs.rename(tmp, STORE_FILE);
  });
  writeLock = next.catch(() => undefined);
  await next;
}

async function quarantineCorrupt(raw: string): Promise<void> {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const corruptPath = path.join(STORE_DIR, `feedback_store.corrupt.${ts}.json`);
    await fs.writeFile(corruptPath, raw, "utf8");
    await fs.writeFile(STORE_FILE, "[]\n", "utf8");
  } catch {
    // last resort: try empty
    try {
      await fs.writeFile(STORE_FILE, "[]\n", "utf8");
    } catch {
      // ignore
    }
  }
}

let writeLock: Promise<void> = Promise.resolve();

export async function appendFeedback(item: ScientistFeedback): Promise<void> {
  const validated = ScientistFeedbackSchema.parse(item);
  // serialize writes to avoid races
  const next = writeLock.then(async () => {
    const items = await readAllFeedback();
    items.push(validated);
    const tmp = STORE_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(items, null, 2) + "\n", "utf8");
    await fs.rename(tmp, STORE_FILE);
  });
  writeLock = next.catch(() => undefined);
  await next;
}

export async function resetFeedback(): Promise<void> {
  await ensureStore();
  await fs.writeFile(STORE_FILE, "[]\n", "utf8");
}

export async function replaceAllFeedback(items: ScientistFeedback[]): Promise<void> {
  await ensureStore();
  const validated = items.map((i) => ScientistFeedbackSchema.parse(i));
  const tmp = STORE_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
  await fs.rename(tmp, STORE_FILE);
}

export function getFeedbackStorePath(): string {
  return STORE_FILE;
}
