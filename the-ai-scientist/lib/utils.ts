import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "of", "on", "or", "that", "the", "to", "with", "will",
  "vs", "via", "than", "between", "into", "this", "these", "those", "such",
  "we", "our", "their", "they", "its", "be", "been", "may", "any", "if",
  "do", "does", "not", "but", "all", "more", "most", "than", "then", "so",
  "can", "could", "would", "should"
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9µ\-+]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function uniqueTokens(text: string): string[] {
  return Array.from(new Set(tokenize(text)));
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const A = new Set(Array.from(a).map((s) => s.toLowerCase()));
  const B = new Set(Array.from(b).map((s) => s.toLowerCase()));
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function tokenOverlap(a: string, b: string): number {
  const at = new Set(tokenize(a));
  const bt = new Set(tokenize(b));
  if (at.size === 0 || bt.size === 0) return 0;
  let inter = 0;
  for (const x of at) if (bt.has(x)) inter += 1;
  return inter / Math.min(at.size, bt.size);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return await Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

export function safeNumber(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const v = Number(n.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

export function truncate(s: string, n = 200): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

export function safeJsonParse<T = unknown>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function humanCurrency(amount: number | null | undefined, currency = "USD"): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return "—";
  }
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
