// Minimal .docx -> Markdown extractor that PRESERVES TABLE STRUCTURE.
// Walks the top-level w:p and w:tbl elements in word/document.xml in order and
// emits paragraphs as text and tables as markdown pipe tables. Multi-line cells
// are flattened with spaces so the table stays parseable to downstream LLMs.
import JSZip from "npm:jszip@3.10.1";

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function paragraphText(p: string): string {
  const texts = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) =>
    decodeXml(m[1])
  );
  return texts.join("");
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function tableToMd(tbl: string): string {
  const rowMatches = [...tbl.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)];
  const rows: string[][] = rowMatches.map((rm) => {
    const cellMatches = [...rm[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)];
    return cellMatches.map((cm) => {
      const paras = [...cm[1].matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((pm) =>
        paragraphText(`<w:p>${pm[1]}</w:p>`)
      );
      return escapePipe(paras.join(" "));
    });
  });
  if (rows.length === 0) return "";
  // Skip single-row layout tables (e.g. the market-analysis title block).
  // Real data tables in these documents always have a header row plus body rows.
  if (rows.length === 1) {
    const text = rows[0].map((c) => c.trim()).filter(Boolean).join(" ").trim();
    return text;
  }
  const maxCols = Math.max(...rows.map((r) => r.length));
  const norm = rows.map((r) => {
    while (r.length < maxCols) r.push("");
    return r;
  });
  const header = norm[0];
  const sep = header.map(() => "---");
  const body = norm.slice(1);
  return [
    "| " + header.join(" | ") + " |",
    "| " + sep.join(" | ") + " |",
    ...body.map((r) => "| " + r.join(" | ") + " |"),
  ].join("\n");
}

function xmlToMarkdown(xml: string): string {
  const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*)<\/w:body>/);
  const body = bodyMatch ? bodyMatch[1] : xml;
  const out: string[] = [];
  // Match top-level w:p or w:tbl. Because nested w:p can appear inside w:tbl cells,
  // we skip w:p that were already consumed by a preceding w:tbl by tracking indices.
  const re = /<w:(p|tbl)\b[^>]*>[\s\S]*?<\/w:\1>/g;
  const consumed: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    // Skip if inside a previously matched tbl.
    if (consumed.some(([s, e]) => start >= s && end <= e && (m as RegExpExecArray)[1] === "p")) continue;
    if (m[1] === "p") {
      const t = paragraphText(m[0]).trim();
      if (t) out.push(t);
    } else {
      const md = tableToMd(m[0]);
      if (md) out.push(md);
      consumed.push([start, end]);
    }
  }
  return out.join("\n\n");
}

export async function extractDocxToMarkdown(buf: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("word/document.xml");
  if (!file) return "";
  const xml = await file.async("string");
  return xmlToMarkdown(xml);
}
