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
} from "npm:docx@8.5.0";
import { authUser, serviceClient } from "../_shared/marketing-plan-common.ts";
import { corsHeaders } from "../_shared/marketing-plan-claude.ts";

function splitInternal(text: string): string {
  const idx = text.indexOf("---INTERNAL---");
  return (idx === -1 ? text : text.slice(0, idx)).trim();
}

// Very small Markdown-to-docx converter. Handles: # / ## / ###, blank lines,
// - / * bullets, and inline **bold**. Everything else is a plain paragraph.
function mdToParagraphs(md: string): Paragraph[] {
  const out: Paragraph[] = [];
  const lines = md.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
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

function runsFromInline(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return new TextRun({ text: p.slice(2, -2), bold: true });
    }
    return new TextRun({ text: p });
  });
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

    const sellerFacing = splitInternal(res.content);

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
          children: mdToParagraphs(sellerFacing),
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
