/**
 * Tiny .env loader for tsx scripts. Next.js auto-loads `.env*` files, but `tsx`
 * does not, so smoke tests / one-off scripts couldn't see OPENAI_API_KEY.
 *
 * Loads, in order: .env, .env.local. Existing process.env values win.
 * Supports KEY=value lines, # comments, blank lines, and quoted values.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvFiles(cwd = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const file of [".env", ".env.local"]) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    const parsed = parseDotenv(readFileSync(path, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(file);
  }
  return loaded;
}

loadEnvFiles();
