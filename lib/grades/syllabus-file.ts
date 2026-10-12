// Syllabus → plain text, in the browser. PDF, Word (.docx) and plain text.
//
// PDF goes through the same pdfjs-dist already used for degree audits. .docx is unpacked by hand:
// a .docx is a ZIP whose word/document.xml holds the text, and browsers have DecompressionStream
// natively, so Word support costs no dependency. The XML → text pass is a regex over
// WordprocessingML rather than a DOM walk, because WordprocessingML is machine-generated and
// regular, and doing it this way also lets tests run outside a browser.
//
// Nothing is uploaded: the file is read on the student's device.

export class ReadError extends Error {
  hint: string;
  key?: string;
  hintKey?: string;

  constructor(message: string, hint = "", opts: { key?: string; hintKey?: string } = {}) {
    super(message);
    this.name = "ReadError";
    this.hint = hint;
    this.key = opts.key;
    this.hintKey = opts.hintKey;
  }
}

export type ReadResult = { text: string; kind: "pdf" | "docx" | "txt"; pages?: number };

/* ------------------------------------------------------------------ ZIP --- */

function u16(v: DataView, at: number) { return v.getUint16(at, true); }
function u32(v: DataView, at: number) { return v.getUint32(at, true); }

/**
 * Pull one entry out of a ZIP. Only what a .docx needs: the central directory to locate the entry,
 * then its local header to find the data. Stored (0) and deflate (8) are the only methods OOXML uses.
 */
export async function readZipEntry(buffer: ArrayBuffer, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // End of central directory: scan back over the (usually empty) archive comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 0xffff; i--) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  const count = u16(view, eocd + 10);
  let at = u32(view, eocd + 16);

  for (let i = 0; i < count; i++) {
    if (u32(view, at) !== 0x02014b50) return null;
    const method = u16(view, at + 10);
    const compressedSize = u32(view, at + 20);
    const nameLen = u16(view, at + 28);
    const extraLen = u16(view, at + 30);
    const commentLen = u16(view, at + 32);
    const localAt = u32(view, at + 42);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen));

    if (name === wanted) {
      if (u32(view, localAt) !== 0x04034b50) return null;
      const localNameLen = u16(view, localAt + 26);
      const localExtraLen = u16(view, localAt + 28);
      const start = localAt + 30 + localNameLen + localExtraLen;
      const raw = bytes.subarray(start, start + compressedSize);
      if (method === 0) return raw.slice();
      if (method !== 8) throw new ReadError("Unsupported compression inside that .docx.");
      const stream = new DecompressionStream("deflate-raw");
      const writer = stream.writable.getWriter();
      writer.write(raw);
      writer.close();
      return new Uint8Array(await new Response(stream.readable).arrayBuffer());
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/* ----------------------------------------------------------------- XML --- */

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/**
 * WordprocessingML → text, keeping table structure.
 * A table cell becomes a tab and a row a newline, so "Homework | 20%" survives as one line —
 * the same shape the weight parser expects from a PDF.
 */
export function docxXmlToText(xml: string): string {
  const body = xml.slice(xml.indexOf("<w:body"));
  const source = body.length > 0 ? body : xml;

  return decodeEntities(
    source
      // Word puts a paragraph inside every table cell, so that paragraph's end must NOT become a
      // line break or a row would fall apart into one line per cell. Drop it first; the cell end
      // below turns into the tab instead.
      .replace(/<\/w:p>\s*(?=<\/w:tc>)/g, "")
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    // Collapse runs of indentation spaces only — a tab is the cell separator inserted above and
    // must survive, or "Homework\t15%" degrades into a space and the table loses its structure.
    .map((line) => line.replace(/ +/g, " ").trim())
    // WordprocessingML is pretty-printed, so the whitespace between tags would otherwise show up as
    // a blank line between every paragraph.
    .filter((line) => line !== "")
    .join("\n")
    .trim();
}

/* --------------------------------------------------------------- readers --- */

async function readDocx(file: File): Promise<ReadResult> {
  const xmlBytes = await readZipEntry(await file.arrayBuffer(), "word/document.xml");
  if (!xmlBytes) {
    throw new ReadError("That .docx could not be read.", "If it is an old .doc file, save it as .docx or .pdf first.", {
      key: "err.read.docxFailed",
      hintKey: "err.read.docxFailedHint",
    });
  }
  const text = docxXmlToText(new TextDecoder().decode(xmlBytes));
  if (text.replace(/\s/g, "").length < 40) {
    throw new ReadError("That document appears to be empty.", "", { key: "err.read.docxEmpty" });
  }
  return { text, kind: "docx" };
}

async function readPdf(file: File, onProgress: (p: { page: number; total: number }) => void): Promise<ReadResult> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    const message = String((err as Error)?.message ?? "");
    if (/password/i.test(message)) {
      throw new ReadError("This PDF is password-protected.", "Remove the password, or export a fresh copy and try again.", {
        key: "err.read.password",
        hintKey: "err.read.passwordHint",
      });
    }
    throw new ReadError("That PDF could not be opened.", "It may be corrupted or an unusual format. You can paste the grading section as text instead.", {
      key: "err.read.openPdf",
      hintKey: "err.read.openPdfHint",
    });
  }

  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    onProgress({ page: p, total: doc.numPages });
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    pages.push(pdfPageLines(content.items as Array<{ str: string; transform: number[]; width?: number; height?: number }>));
    page.cleanup();
  }
  await doc.destroy();

  const text = pages.join("\n\n");
  if (text.replace(/\s/g, "").length < 40) {
    throw new ReadError("That PDF has no selectable text.", "It looks like a scan or photographs of pages. Run it through OCR, or paste the grading section as text.", {
      key: "err.read.noText",
      hintKey: "err.read.noTextHint",
    });
  }
  return { text, kind: "pdf", pages: doc.numPages };
}

/**
 * Rebuild lines from pdf.js text items by position.
 *
 * A naive join turns a grading table into "Homework Midterm Final 20% 30% 50%", and no weight parser
 * can attribute those numbers. Items sharing a baseline become one line ordered left to right, and a
 * wide horizontal gap becomes a tab so table cells stay separable.
 */
export function pdfPageLines(
  items: Array<{ str: string; transform: number[]; width?: number; height?: number }>,
  opts: { yTolerance?: number; gapRatio?: number } = {},
): string {
  const yTolerance = opts.yTolerance ?? 2.5;
  const gapRatio = opts.gapRatio ?? 0.9;

  const rows = new Map<number, Array<{ x: number; str: string; h: number; w: number }>>();
  for (const it of items) {
    if (!it.str) continue;
    const x = it.transform?.[4] ?? 0;
    const y = it.transform?.[5] ?? 0;
    const h = Math.abs(it.transform?.[3] ?? it.height ?? 10) || 10;
    let key: number | null = null;
    for (const k of rows.keys()) if (Math.abs(k - y) <= yTolerance) { key = k; break; }
    if (key === null) { key = y; rows.set(key, []); }
    rows.get(key)!.push({ x, str: it.str, h, w: it.width ?? 0 });
  }

  const lines: string[] = [];
  for (const [, parts] of [...rows.entries()].sort((a, b) => b[0] - a[0])) {
    parts.sort((a, b) => a.x - b.x);
    let line = "";
    let prevEnd: number | null = null;
    for (const p of parts) {
      if (prevEnd !== null) {
        const gap = p.x - prevEnd;
        const h = p.h || 10;
        // A negative gap means two separate runs overlapping, not one word split in two, so a
        // separator is required — otherwise a heading fuses onto the row beneath it.
        if (gap < -0.5) line += " ";
        else if (gap > h * gapRatio) line += "\t";
        else if (gap > h * 0.22) line += " ";
      }
      line += p.str;
      prevEnd = p.x + p.w;
    }
    const trimmed = line.replace(/[ \t]+$/, "");
    if (trimmed.trim()) lines.push(trimmed);
  }
  return lines.join("\n");
}

export function fileKind(file: { name?: string; type?: string }): "pdf" | "docx" | "doc" | "txt" | null {
  const name = (file?.name ?? "").toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));
  if (ext === ".pdf" || file?.type === "application/pdf") return "pdf";
  if (ext === ".docx" || file?.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (ext === ".doc") return "doc";
  if ([".txt", ".md", ".rtf"].includes(ext) || (file?.type ?? "").startsWith("text/")) return "txt";
  return null;
}

export async function readSyllabusFile(
  file: File,
  onProgress: (p: { page: number; total: number }) => void = () => {},
): Promise<ReadResult> {
  if (!file) throw new ReadError("No file was chosen.", "", { key: "err.read.noFile" });
  if (file.size > 25 * 1024 * 1024) {
    throw new ReadError("That file is larger than 25 MB.", "Syllabi are usually well under a megabyte.", {
      key: "err.read.tooBig",
      hintKey: "err.read.tooBigHint",
    });
  }

  switch (fileKind(file)) {
    case "pdf": return readPdf(file, onProgress);
    case "docx": return readDocx(file);
    case "txt": return { text: await file.text(), kind: "txt" };
    case "doc":
      throw new ReadError("Legacy .doc files cannot be read in the browser.", "Open it in Word or Pages and save as .docx or .pdf, then upload that.", {
        key: "err.read.doc",
        hintKey: "err.read.docHint",
      });
    default:
      throw new ReadError(`“${file.name}” is not a supported format.`, "Upload a PDF, .docx or .txt file — or paste the grading section as text.", {
        key: "err.read.unsupported",
        hintKey: "err.read.unsupportedHint",
      });
  }
}
