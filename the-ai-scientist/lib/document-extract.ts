/**
 * Extracts plain-text from uploaded files (PDF or text/plain). The output
 * is hard-capped at MAX_CHARS so a single 100MB PDF can't blow up the
 * feedback/plan store JSON file or the LLM prompt budget.
 */

const MAX_CHARS = 60_000;
const PDF_MIME = "application/pdf";
const TEXT_MIME_PREFIX = "text/";

export type ExtractionResult = {
  text: string;
  truncated: boolean;
  page_count: number | null;
  content_type: string;
};

export class UnsupportedFileError extends Error {
  constructor(public readonly contentType: string, public readonly filename: string) {
    super(`Unsupported file type "${contentType}" for ${filename}. Only PDF and plain text are accepted.`);
  }
}

function normalizeText(raw: string): { text: string; truncated: boolean } {
  if (!raw) return { text: "", truncated: false };
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n");
  if (cleaned.length <= MAX_CHARS) return { text: cleaned, truncated: false };
  return { text: cleaned.slice(0, MAX_CHARS) + "\n…[truncated]", truncated: true };
}

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF";
}

async function extractPdf(buffer: Buffer): Promise<{ text: string; page_count: number | null }> {
  // pdf-parse@^2 ships a class-based API. We use the Node-friendly
  // PDFParse class with a Uint8Array view of the buffer (avoids the
  // shared-memory pitfalls of passing the underlying ArrayBuffer).
  const mod: any = await import("pdf-parse");
  const PDFParse = (mod && (mod.PDFParse || mod.default?.PDFParse)) as
    | (new (opts: { data: Uint8Array }) => {
        getText(): Promise<{ text: string; total: number; pages?: Array<unknown> }>;
        destroy(): Promise<void>;
      })
    | undefined;

  if (!PDFParse) {
    throw new Error("pdf-parse PDFParse class is unavailable in this environment.");
  }

  // Copy the relevant slice into a fresh Uint8Array so pdfjs-dist gets
  // a tightly bound buffer it can transfer without surprises.
  const view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new PDFParse({ data: view });
  try {
    const result = await parser.getText();
    return {
      text: typeof result.text === "string" ? result.text : "",
      page_count:
        typeof result.total === "number"
          ? result.total
          : Array.isArray(result.pages)
            ? result.pages.length
            : null
    };
  } finally {
    try {
      await parser.destroy();
    } catch {
      // best-effort cleanup
    }
  }
}

export async function extractDocumentText(args: {
  buffer: Buffer;
  filename: string;
  contentType: string;
}): Promise<ExtractionResult> {
  const ct = (args.contentType || "").toLowerCase();
  const isPdf = ct === PDF_MIME || (ct === "" && looksLikePdf(args.buffer)) || args.filename.toLowerCase().endsWith(".pdf");
  const isText =
    ct.startsWith(TEXT_MIME_PREFIX) ||
    args.filename.toLowerCase().endsWith(".txt") ||
    args.filename.toLowerCase().endsWith(".md");

  if (isPdf) {
    const { text, page_count } = await extractPdf(args.buffer);
    const norm = normalizeText(text);
    return {
      text: norm.text,
      truncated: norm.truncated,
      page_count,
      content_type: PDF_MIME
    };
  }

  if (isText) {
    const raw = args.buffer.toString("utf8");
    const norm = normalizeText(raw);
    return {
      text: norm.text,
      truncated: norm.truncated,
      page_count: null,
      content_type: ct.startsWith(TEXT_MIME_PREFIX) ? ct : "text/plain"
    };
  }

  throw new UnsupportedFileError(ct || "unknown", args.filename);
}

export const DOCUMENT_MAX_CHARS = MAX_CHARS;
