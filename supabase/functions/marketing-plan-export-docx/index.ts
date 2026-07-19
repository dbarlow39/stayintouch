// Builds a Word .docx from the seller-facing half of the marketing plan.
// Never includes the "---INTERNAL---" section.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ImageRun,
  VerticalAlign,
} from "npm:docx@8.5.0";
import { authUser, serviceClient } from "../_shared/marketing-plan-common.ts";
import { corsHeaders } from "../_shared/marketing-plan-claude.ts";

const DARK_SCARLET = "8B0000";
const SCARLET = "CC0000";
const LOGO_URL = "https://stayintouch.lovable.app/logo.jpg";

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function stripLeadingH1(md: string): string {
  // Strip the leading "# Marketing Plan for ..." H1 AND any immediately
  // following "Prepared by: ..." line — the docx header already prints both,
  // so leaving them in the body causes them to appear twice.
  let out = md.replace(/^\s*#\s+Marketing Plan for[^\n]*\n+/i, "");
  out = out.replace(/^\s*Prepared by:[^\n]*\n+/i, "");
  return out;
}

// Pull out just the seller-facing half. Supports both the new
// ---VERIFICATION--- / ---PLAN--- ordering (internal first, seller second)
// AND the legacy ---INTERNAL--- ordering (seller first, internal second).
function sellerFacingOnly(text: string): string {
  const planIdx = text.indexOf("---PLAN---");
  if (planIdx !== -1) {
    return text.slice(planIdx + "---PLAN---".length).trim();
  }
  const legacyIdx = text.indexOf("---INTERNAL---");
  if (legacyIdx !== -1) {
    // legacy: seller was before the delimiter, may also have a leading
    // ---VERIFICATION--- header that we should drop.
    const before = text.slice(0, legacyIdx).trim();
    return before.replace(/^---VERIFICATION---[\s\S]*?(?=^#\s)/m, "").trim();
  }
  return text.trim();
}

function runsFromInline(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return new TextRun({ text: p.slice(2, -2), bold: true });
    }
    return new TextRun({ text: p });
  });
}

// Detect a markdown pipe-table starting at line index `i`. Returns the table
// element and how many lines it consumed, or null if this isn't a table.
function tryConsumeTable(lines: string[], i: number): { table: Table; consumed: number } | null {
  const isPipeRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isSepRow = (s: string) => /^\s*\|?\s*(:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(s);
  if (!isPipeRow(lines[i]) || !isSepRow(lines[i + 1] || "")) return null;
  const rows: string[][] = [];
  const parse = (s: string) =>
    s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  rows.push(parse(lines[i]));
  let j = i + 2;
  while (j < lines.length && isPipeRow(lines[j])) {
    rows.push(parse(lines[j]));
    j++;
  }
  const maxCols = Math.max(...rows.map((r) => r.length));
  const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
  const tableWidth = 9360;
  const colWidth = Math.floor(tableWidth / maxCols);
  const table = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: Array(maxCols).fill(colWidth),
    rows: rows.map((r, ri) =>
      new TableRow({
        children: Array.from({ length: maxCols }, (_, ci) => {
          const text = r[ci] || "";
          return new TableCell({
            width: { size: colWidth, type: WidthType.DXA },
            borders: cellBorders,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [
              new Paragraph({
                children: ri === 0
                  ? [new TextRun({ text, bold: true })]
                  : runsFromInline(text),
              }),
            ],
          });
        }),
      })
    ),
  });
  return { table, consumed: j - i };
}

// Very small Markdown-to-docx converter. Handles: # / ## / ###, blank lines,
// - / * bullets, inline **bold**, and pipe tables.
function mdToDocxChildren(md: string): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const tbl = tryConsumeTable(lines, i);
    if (tbl) {
      out.push(tbl.table);
      i += tbl.consumed - 1;
      continue;
    }
    if (!line.trim()) {
      out.push(new Paragraph({ children: [new TextRun("")] }));
      continue;
    }
    if (line.startsWith("### ")) {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runsFromInline(line.slice(4)) }));
      continue;
    }
    if (line.startsWith("## ")) {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runsFromInline(line.slice(3)) }));
      continue;
    }
    if (line.startsWith("# ")) {
      out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: runsFromInline(line.slice(2)) }));
      continue;
    }
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) {
      out.push(new Paragraph({ bullet: { level: 0 }, children: runsFromInline(m[1]) }));
      continue;
    }
    out.push(new Paragraph({ children: runsFromInline(line) }));
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await authUser(req);
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { jobId } = await req.json();
    const db = serviceClient();

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("id, user_id, seller_lead_id")
      .eq("id", jobId)
      .single();
    if (!job || job.user_id !== auth.userId) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: res } = await db
      .from("marketing_plan_results")
      .select("content")
      .eq("job_id", jobId)
      .eq("stage", "marketing_plan")
      .maybeSingle();
    if (!res?.content) {
      return new Response(JSON.stringify({ error: "Plan not ready" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: lead }, { data: profile }] = await Promise.all([
      db.from("leads").select("address, city, state, zip").eq("id", job.seller_lead_id).maybeSingle(),
      db.from("profiles").select("full_name, first_name, last_name").eq("id", job.user_id).maybeSingle(),
    ]);

    const agentName =
      profile?.full_name ||
      `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() ||
      "Your Agent";
    const addressLine = lead?.address
      ? `${lead.address}, ${lead.city || ""} ${lead.state || ""} ${lead.zip || ""}`.replace(/\s+/g, " ").trim()
      : "";
    const dateLine = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    let logoBytes: Uint8Array | null = null;
    try {
      const r = await fetch(LOGO_URL);
      if (r.ok) logoBytes = new Uint8Array(await r.arrayBuffer());
    } catch (_) { /* fall back to no logo */ }

    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              borders: noBorder,
              verticalAlign: VerticalAlign.CENTER,
              children: logoBytes
                ? [new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 252, height: 117 }, type: "jpg" })] })]
                : [new Paragraph({ children: [] })],
            }),
            new TableCell({
              width: { size: 6500, type: WidthType.DXA },
              borders: noBorder,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [new TextRun({ text: "MARKETING PLAN", bold: true, color: DARK_SCARLET, font: "Arial", size: 32 })],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60 },
                  children: [new TextRun({ text: addressLine, bold: true, color: SCARLET, font: "Arial", size: 20 })],
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60 },
                  children: [new TextRun({ text: `Prepared by: ${agentName} | ${dateLine}`, color: DARK_SCARLET, font: "Arial", size: 18 })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const headerRule = new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: SCARLET } },
      children: [],
    });

    const sellerFacing = stripLeadingH1(sellerFacingOnly(res.content));


    const doc = new Document({
      styles: {
        default: { document: { run: { font: "Arial", size: 22 } } },
        paragraphStyles: [
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 34, bold: true, font: "Arial", color: "9B111E" },
            paragraph: { spacing: { before: 280, after: 200 }, outlineLevel: 0, alignment: AlignmentType.LEFT } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 28, bold: true, font: "Arial", color: "9B111E" },
            paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 1 } },
          { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
            run: { size: 24, bold: true, font: "Arial" },
            paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 2 } },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children: [headerTable, headerRule, ...mdToDocxChildren(sellerFacing)],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="marketing-plan-${jobId}.docx"`,
      },
    });
  } catch (e) {
    console.error("export-docx error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
