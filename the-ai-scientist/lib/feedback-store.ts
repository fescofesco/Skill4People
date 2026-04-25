import { promises as fs } from "fs";
import path from "path";
import { ScientistFeedback, ScientistFeedbackSchema } from "./schemas";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "feedback_store.json");

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
  for (const entry of parsed) {
    const result = ScientistFeedbackSchema.safeParse(entry);
    if (result.success) valid.push(result.data);
  }
  return valid;
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
