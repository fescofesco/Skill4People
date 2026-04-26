import { promises as fs } from "fs";
import path from "path";
import { Category, CategorySchema } from "./schemas";
import { nowIso } from "./utils";

const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "category_store.json");

type CategoryStore = Record<string, Category[]>;

/**
 * Default categories materialised lazily for any organisation that has no
 * categories yet. The list is intentionally short and process-oriented
 * (NOT topic-oriented) so users pick one at plan-creation time without
 * scrolling.
 */
const SEED_CATEGORIES: Omit<Category, "created_at">[] = [
  {
    id: "chemical_synthesis",
    name: "Chemical synthesis",
    description: "Reactions, purifications, and structural characterisation of small molecules.",
    builtin: true
  },
  {
    id: "colloidal_synthesis",
    name: "Colloidal synthesis",
    description: "Nanoparticle / nanocrystal synthesis, ligand exchange, and dispersion stability.",
    builtin: true
  },
  {
    id: "mechanical_setup",
    name: "Mechanical setup building",
    description: "Building or modifying experimental rigs, jigs, or instrument hardware.",
    builtin: true
  },
  {
    id: "cell_biology",
    name: "Cell biology / culture",
    description: "Cell-line work, transfection, cytotoxicity, microscopy of live or fixed cells.",
    builtin: true
  },
  {
    id: "electrochemistry",
    name: "Electrochemistry",
    description: "Cyclic voltammetry, EIS, electrolytic / fuel-cell work, bioelectrochemistry.",
    builtin: true
  },
  {
    id: "analytical",
    name: "Analytical / characterisation",
    description: "HPLC, MS, NMR, XRD, microscopy, and other characterisation workflows.",
    builtin: true
  },
  {
    id: "other",
    name: "Other",
    description: "Use this for anything that doesn't fit the above process buckets.",
    builtin: true
  }
];

async function ensureStore(): Promise<void> {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
  } catch {
    // ignore
  }
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, "{}\n", "utf8");
  }
}

async function readRaw(): Promise<CategoryStore> {
  await ensureStore();
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as CategoryStore;
  } catch {
    return {};
  }
}

let writeLock: Promise<void> = Promise.resolve();

async function writeRaw(next: CategoryStore): Promise<void> {
  await ensureStore();
  const job = writeLock.then(async () => {
    const tmp = STORE_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
    await fs.rename(tmp, STORE_FILE);
  });
  writeLock = job.catch(() => undefined);
  await job;
}

function seedFor(organizationId: string): Category[] {
  const created_at = nowIso();
  return SEED_CATEGORIES.map((c) => CategorySchema.parse({ ...c, created_at }));
}

export async function listCategories(organizationId: string): Promise<Category[]> {
  const store = await readRaw();
  if (!store[organizationId] || store[organizationId].length === 0) {
    const seeded = seedFor(organizationId);
    store[organizationId] = seeded;
    await writeRaw(store).catch(() => undefined);
    return seeded;
  }
  return store[organizationId].map((c) => {
    const result = CategorySchema.safeParse(c);
    if (result.success) return result.data;
    return CategorySchema.parse({
      id: typeof c?.id === "string" ? c.id : "other",
      name: typeof c?.name === "string" ? c.name : "Other",
      description: typeof c?.description === "string" ? c.description : undefined,
      created_at: typeof c?.created_at === "string" ? c.created_at : nowIso(),
      builtin: !!c?.builtin
    });
  });
}

export async function getCategory(
  organizationId: string,
  categoryId: string
): Promise<Category | null> {
  const list = await listCategories(organizationId);
  return list.find((c) => c.id === categoryId) ?? null;
}

export async function createCategory(
  organizationId: string,
  input: { name: string; description?: string }
): Promise<Category> {
  const id = slugifyCategoryName(input.name);
  const list = await listCategories(organizationId);
  if (list.some((c) => c.id === id)) {
    throw new Error(`A category with id "${id}" already exists.`);
  }
  const next: Category = CategorySchema.parse({
    id,
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    created_at: nowIso(),
    builtin: false
  });
  const store = await readRaw();
  store[organizationId] = [...list, next];
  await writeRaw(store);
  return next;
}

export async function updateCategory(
  organizationId: string,
  categoryId: string,
  patch: { name?: string; description?: string }
): Promise<Category> {
  const list = await listCategories(organizationId);
  const idx = list.findIndex((c) => c.id === categoryId);
  if (idx === -1) throw new Error(`Category "${categoryId}" not found.`);
  const merged: Category = CategorySchema.parse({
    ...list[idx],
    name: patch.name?.trim() || list[idx].name,
    description:
      typeof patch.description === "string" && patch.description.trim().length > 0
        ? patch.description.trim()
        : list[idx].description
  });
  const updated = [...list];
  updated[idx] = merged;
  const store = await readRaw();
  store[organizationId] = updated;
  await writeRaw(store);
  return merged;
}

export async function deleteCategory(
  organizationId: string,
  categoryId: string
): Promise<void> {
  const list = await listCategories(organizationId);
  const target = list.find((c) => c.id === categoryId);
  if (!target) return;
  if (target.builtin) {
    throw new Error("Built-in categories cannot be deleted; rename them instead.");
  }
  const next = list.filter((c) => c.id !== categoryId);
  const store = await readRaw();
  store[organizationId] = next;
  await writeRaw(store);
}

export function slugifyCategoryName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!cleaned) return "other";
  return cleaned.slice(0, 48);
}

export function getCategoryStorePath(): string {
  return STORE_FILE;
}
