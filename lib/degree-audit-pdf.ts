// This module is imported only after a student chooses a file. PDF bytes and extracted
// text stay in this browser; the Site never receives either one.
export type PositionedText = { str: string; x: number; y: number; width: number };

export function degreeAuditPageLines(items: PositionedText[]) {
  const rows: Array<{ y: number; items: PositionedText[] }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 2.5);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.sort((a, b) => b.y - a.y).map((row) => {
    const sorted = row.items.sort((a, b) => a.x - b.x);
    let value = "";
    let previous: PositionedText | null = null;
    for (const item of sorted) {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap > 1.5 && !value.endsWith(" ") && !item.str.startsWith(" ")) value += " ";
      value += item.str;
      previous = item;
    }
    return value.replace(/\s+/g, " ").trim();
  }).filter(Boolean);
}

export async function extractDegreeAuditText(file: File) {
  if (file.size > 12 * 1024 * 1024) throw new Error("size");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("type");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await task.promise;
  try {
    if (document.numPages > 60) throw new Error("pages");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedText[] = content.items.flatMap((item) => "str" in item
        ? [{ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }]
        : []);
      pages.push(degreeAuditPageLines(items).join("\n"));
      page.cleanup();
    }
    return pages.join("\n");
  } finally {
    await task.destroy();
  }
}
