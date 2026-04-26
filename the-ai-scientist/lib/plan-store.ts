import { promises as fs } from "fs";
import path from "path";
import {
  PlanUpdateRequest,
  SavedPlan,
  SavedPlanSchema,
  SavedPlanSummary,
  SavedPlanSummarySchema
} from "./schemas";
import { newId } from "./ids";
import { nowIso, truncate } from "./utils";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "plan_store.json");

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

export async function readAllPlans(): Promise<SavedPlan[]> {
  await ensureStore();
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedPlan[] = [];
    for (const entry of parsed) {
      const result = SavedPlanSchema.safeParse(entry);
      if (result.success) out.push(result.data);
    }
    return out;
  } catch {
    return [];
  }
}

let writeLock: Promise<void> = Promise.resolve();

async function writeAllPlans(items: SavedPlan[]): Promise<void> {
  await ensureStore();
  const validated = items.map((i) => SavedPlanSchema.parse(i));
  const job = writeLock.then(async () => {
    const tmp = STORE_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
    await fs.rename(tmp, STORE_FILE);
  });
  writeLock = job.catch(() => undefined);
  await job;
}

export async function getPlan(id: string): Promise<SavedPlan | null> {
  const items = await readAllPlans();
  return items.find((p) => p.id === id) ?? null;
}

export async function listPlanSummaries(args: {
  organization_id: string;
  category_id?: string | null;
}): Promise<SavedPlanSummary[]> {
  const items = await readAllPlans();
  const scoped = items.filter((p) => {
    if (p.organization_id !== args.organization_id) return false;
    if (args.category_id && p.category_id !== args.category_id) return false;
    return true;
  });
  scoped.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  return scoped.map((p) => toSummary(p));
}

export function toSummary(p: SavedPlan): SavedPlanSummary {
  const summary = {
    id: p.id,
    organization_id: p.organization_id,
    category_id: p.category_id,
    title: p.title,
    hypothesis_snippet: truncate(p.hypothesis.replace(/\s+/g, " "), 160),
    domain: p.parsed_hypothesis?.domain || p.plan?.hypothesis?.parsed?.domain,
    experiment_type: p.parsed_hypothesis?.experiment_type || p.plan?.hypothesis?.parsed?.experiment_type,
    has_critique:
      !!p.critique && Array.isArray((p.critique as any)?.findings) && (p.critique as any).findings.length > 0,
    feedback_used_count: p.feedback_used.length,
    created_at: p.created_at,
    updated_at: p.updated_at
  };
  return SavedPlanSummarySchema.parse(summary);
}

export type UpsertPlanInput = Omit<SavedPlan, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export async function upsertPlan(input: UpsertPlanInput): Promise<SavedPlan> {
  const items = await readAllPlans();
  const now = nowIso();
  if (input.id) {
    const idx = items.findIndex((p) => p.id === input.id);
    if (idx >= 0) {
      const merged: SavedPlan = SavedPlanSchema.parse({
        ...items[idx],
        ...input,
        id: input.id,
        created_at: items[idx].created_at,
        updated_at: now
      });
      items[idx] = merged;
      await writeAllPlans(items);
      return merged;
    }
  }
  const created: SavedPlan = SavedPlanSchema.parse({
    ...input,
    id: input.id || newId("plan"),
    created_at: input.created_at || now,
    updated_at: now
  });
  items.push(created);
  await writeAllPlans(items);
  return created;
}

export async function updatePlan(
  id: string,
  patch: PlanUpdateRequest
): Promise<SavedPlan | null> {
  const items = await readAllPlans();
  const idx = items.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const next: SavedPlan = SavedPlanSchema.parse({
    ...items[idx],
    title: patch.title ?? items[idx].title,
    category_id: patch.category_id ?? items[idx].category_id,
    plan: patch.plan ?? items[idx].plan,
    critique: patch.critique ?? items[idx].critique,
    updated_at: nowIso()
  });
  items[idx] = next;
  await writeAllPlans(items);
  return next;
}

export async function deletePlan(id: string): Promise<boolean> {
  const items = await readAllPlans();
  const next = items.filter((p) => p.id !== id);
  if (next.length === items.length) return false;
  await writeAllPlans(next);
  return true;
}

export async function planStoreStatus(): Promise<{ exists: boolean; count: number }> {
  try {
    const items = await readAllPlans();
    return { exists: true, count: items.length };
  } catch {
    return { exists: false, count: 0 };
  }
}

export function getPlanStorePath(): string {
  return STORE_FILE;
}
