// Stage 3: extract facts from ALL documents attached to this lead:
//   - HOA / disclosure / other files uploaded specifically for the marketing plan
//     (marketing_plan_documents rows, uploaded via the Marketing Plan tab)
//   - Every file already attached to the seller lead's Market Analysis
//     (market_analysis_files: PDFs, .docx exports, the generated analysis JSON,
//      and inline residential-inspection data)
//   - The Residential Inspection Worksheet row (inspections table)
//
// PDFs are sent as native Anthropic document blocks; .docx files are unpacked
// server-side with docx-extract so tables (comparable sales, tax records, etc.)
// come through as markdown pipe tables rather than a wall of flattened text.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalCaller,
  checkGateAndAdvance,
  markStage,
  saveResultIfMissing,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import {
  callClaude,
  corsHeaders,
  OPUS_MODEL,
  type Block,
} from "../_shared/marketing-plan-claude.ts";
import { extractDocxToMarkdown } from "../_shared/docx-extract.ts";
import { STAGE4_REQUIRED, STAGE5_REQUIRED } from "../_shared/marketing-plan-gates.ts";

async function advanceDownstreamGates(db: any, jobId: string) {
  try {
    await checkGateAndAdvance(db, jobId, STAGE4_REQUIRED, "marketing-plan-stage4-area", "stage4_dispatch");
  } catch (e) { console.error("stage3 gate4 advance error:", e); }
  try {
    await checkGateAndAdvance(db, jobId, STAGE5_REQUIRED, "marketing-plan-stage5-plan", "stage5_dispatch");
  } catch (e) { console.error("stage3 gate5 advance error:", e); }
}

const SYSTEM_PROMPT = `You are extracting hard facts from real estate association, disclosure, market-analysis, and inspection documents so an agent can market a listing accurately. Quote the document and page (or the document label) for every fact. If a fact is not present, write "NOT FOUND - must confirm." Never estimate or infer a number. Return Markdown:

## Neighborhood Snapshot
From any attached market-analysis JSON, .docx, or PDF, extract these five values into a Markdown pipe table with columns Field | Value | Source. Fields (in this exact order): School District, Subdivision, Walkability Score, Crime Risk Score, Flood Zone. If a value is not present in the documents, write "NOT FOUND" for that row's Value. This section is authoritative for Stage 4 and must always be emitted, even if every row is NOT FOUND.

## HOA Dues
Exact monthly or annual amount and precisely what it covers; note anything billed separately to the owner such as water, sewer, gas, or electric.

## Age Restriction
Is the community LEGALLY deed-restricted 55+ (housing for older persons), or merely age-targeted marketing? Quote the governing document. This is a Fair Housing matter - never guess. Also note rental and leasing limits.

## Amenities Confirmed
Which amenities the documents actually establish exist.

## Home Features
Square footage, year built, flooring, kitchen, primary suite, basement or the absence of one, garage, outdoor spaces. Treat any seller-written description as CLAIMS to verify, clearly labeled as such.

## Comparable Sales (from Market Analysis)
If a market-analysis document or JSON is attached, list every comparable sale with address, closed date, list price, sold price, beds/baths, square footage, year built, and days on market. Preserve the comps table exactly as given.

## Material Facts
Systems, age, repairs, water and sewer, radon, flood plain, defects.

## Numbers To Verify
Every figure that should be checked against the MLS or county.`;

// -------- helpers --------

async function downloadFromBucket(
  db: any,
  bucket: string,
  path: string,
): Promise<Uint8Array | null> {
  try {
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  } catch {
    return null;
  }
}

function toBase64(buf: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function jsonToMarkdown(label: string, obj: unknown): string {
  // Keep the raw JSON so Claude can quote precise fields (prices, DOM, etc.).
  const pretty = JSON.stringify(obj, null, 2);
  return `### ${label}\n\n\`\`\`json\n${pretty.slice(0, 60000)}\n\`\`\``;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Hard server-side deadline for the entire stage. Prevents silent isolate
// kills from leaving the job stuck at status='running'.
const STAGE3_DEADLINE_MS = 240_000;

async function runDocs(jobId: string) {
  const db = serviceClient();
  const startedAt = Date.now();
  const FAILSAFE = "# Document Facts (Stage 3)\n\n> Stage 3 did not complete cleanly. Document facts unavailable.";

  try {
    await markStage(db, jobId, "document_facts", "running");

    // Look up the seller lead so we can pull associated documents automatically.
    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("seller_lead_id, user_id")
      .eq("id", jobId)
      .single();
    const leadId = job?.seller_lead_id;
    const agentId = job?.user_id;

    const blocks: Block[] = [];
    const textNotes: string[] = [];

    // 1) HOA / disclosure docs uploaded specifically for this marketing plan.
    const { data: mpDocs } = await db
      .from("marketing_plan_documents")
      .select("id, storage_path, doc_type, filename")
      .eq("job_id", jobId);

    for (const d of mpDocs || []) {
      const buf = await downloadFromBucket(db, "marketing-plan-docs", d.storage_path);
      if (!buf) continue;
      const isDocx =
        d.filename.toLowerCase().endsWith(".docx") ||
        d.storage_path.toLowerCase().endsWith(".docx");
      if (isDocx) {
        const md = await extractDocxToMarkdown(buf).catch(() => "");
        if (md.trim()) {
          textNotes.push(
            `### Uploaded document (.docx): ${d.filename} - Type: ${d.doc_type}\n\n${md}`,
          );
        }
      } else {
        blocks.push({
          type: "text",
          text: `Filename: ${d.filename} - Type: ${d.doc_type}`,
        });
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: toBase64(buf) },
        });
      }
    }

    // 2) Everything already attached to the seller lead's Market Analysis.
    if (leadId && agentId) {
      const { data: maFiles } = await db
        .from("market_analysis_files")
        .select(
          "file_name, file_path, mime_type, file_type, source_type, inline_data, analysis_json, document_label",
        )
        .eq("lead_id", leadId)
        .eq("agent_id", agentId);

      for (const r of maFiles || []) {
        const label = r.document_label || r.file_name || "Market Analysis file";
        if (r.file_type === "analysis_json" && r.analysis_json) {
          textNotes.push(jsonToMarkdown(`Market Analysis JSON (${label})`, r.analysis_json));
          continue;
        }
        if (r.source_type === "inline" && r.inline_data) {
          textNotes.push(jsonToMarkdown(`Attached inline data (${label})`, r.inline_data));
          continue;
        }
        if (r.source_type === "storage" && r.file_path) {
          const buf = await downloadFromBucket(db, "market-analysis-docs", r.file_path);
          if (!buf) continue;
          const mime = (r.mime_type || "").toLowerCase();
          const nameLower = (r.file_name || "").toLowerCase();
          const isDocx = mime === DOCX_MIME || nameLower.endsWith(".docx");
          const isPdf = mime === "application/pdf" || nameLower.endsWith(".pdf");
          if (isDocx) {
            const md = await extractDocxToMarkdown(buf).catch(() => "");
            if (md.trim()) {
              textNotes.push(`### Market Analysis file (.docx): ${label}\n\n${md}`);
            }
            continue;
          }
          if (isPdf) {
            blocks.push({ type: "text", text: `Market Analysis file (PDF): ${label}` });
            blocks.push({
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: toBase64(buf) },
            });
            continue;
          }
          textNotes.push(`### Market Analysis file skipped (${mime || "unknown type"}): ${label}`);
        }
      }
    }

    // 3) Residential Inspection Worksheet + recorded homeowner conversations.
    if (leadId) {
      const { data: insp } = await db
        .from("inspections")
        .select("id, property_address, inspection_data, updated_at")
        .eq("lead_id", leadId)
        .maybeSingle();
      if (insp?.inspection_data) {
        textNotes.push(
          jsonToMarkdown(
            `Residential Inspection Worksheet (${insp.property_address || "seller lead"})`,
            insp.inspection_data,
          ),
        );
      }

      if (insp?.id) {
        const { data: transcripts } = await db
          .from("audio_transcriptions")
          .select("transcription, summary, created_at")
          .eq("inspection_id", insp.id)
          .eq("status", "completed")
          .order("created_at", { ascending: true });

        const MAX_TRANSCRIPT_CHARS = 40000;
        for (const t of transcripts || []) {
          const summary = (t.summary || "").trim();
          let full = (t.transcription || "").trim();
          if (!summary && !full) continue;
          if (full.length > MAX_TRANSCRIPT_CHARS) {
            full = full.slice(0, MAX_TRANSCRIPT_CHARS) + "\n\n[...truncated]";
          }
          textNotes.push(
            `### Filename: Listing appointment conversation - Type: Agent and homeowner transcript - Source: auto-attached from seller lead\n\n` +
              (summary ? `--- SUMMARY ---\n${summary}\n\n` : "") +
              (full ? `--- FULL TRANSCRIPT ---\n${full}` : ""),
          );
        }
      }
    }

    if (blocks.length === 0 && textNotes.length === 0) {
      await saveStageResult(
        db,
        jobId,
        "document_facts",
        "# Document Facts (Stage 3)\n\n> No documents attached to this lead - HOA, disclosure, market-analysis, and inspection facts could not be verified.",
      );
      return;
    }

    if (textNotes.length > 0) {
      blocks.unshift({
        type: "text",
        text:
          "The following documents are attached as TEXT (auto-extracted from .docx or JSON). Treat pipe-tables as authoritative table data.\n\n" +
          textNotes.join("\n\n---\n\n"),
      });
    }

    const MAX_BYTES = 25 * 1024 * 1024;
    const groups: Block[][] = [[]];
    let groupBytes = 0;
    for (const b of blocks) {
      const approx = b.type === "document" && (b as any).source?.data
        ? ((b as any).source.data.length as number)
        : (JSON.stringify(b).length as number);
      if (groupBytes + approx > MAX_BYTES && groups[groups.length - 1].length > 0) {
        groups.push([]);
        groupBytes = 0;
      }
      groups[groups.length - 1].push(b);
      groupBytes += approx;
    }

    const outputs: string[] = [];
    for (const g of groups) {
      if (g.length === 0) continue;
      if (Date.now() - startedAt > STAGE3_DEADLINE_MS) {
        console.warn(`stage3 hit ${STAGE3_DEADLINE_MS}ms deadline mid-batch`);
        break;
      }
      g.push({
        type: "text",
        text:
          "Return the full Markdown report described in the system prompt for all attached and text-extracted content.",
      });
      const res = await callClaude({
        model: OPUS_MODEL,
        system: SYSTEM_PROMPT,
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        messages: [{ role: "user", content: g }],
      });
      outputs.push(res.text);
    }

    if (outputs.length === 0) {
      await saveStageResult(
        db,
        jobId,
        "document_facts",
        `# Document Facts (Stage 3)\n\n> Stage hit ${STAGE3_DEADLINE_MS / 1000}-second server deadline before any batch completed.`,
      );
      return;
    }

    const merged = outputs.length === 1
      ? outputs[0]
      : (await callClaude({
          model: OPUS_MODEL,
          system:
            "Merge these batch outputs into a single Markdown report under the same seven headings. Preserve every document quote, page reference, and comparable-sales row.",
          max_tokens: 12000,
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
          messages: [{
            role: "user",
            content: outputs.map((o, i) => `--- BATCH ${i + 1} ---\n${o}`).join("\n\n"),
          }],
        })).text;

    await saveStageResult(db, jobId, "document_facts", `# Document Facts (Stage 3)\n\n${merged}`);
  } catch (e) {
    console.error("stage3 background error:", e);
    try {
      await saveStageResult(
        db,
        jobId,
        "document_facts",
        `# Document Facts (Stage 3)\n\n> Stage failed: ${e instanceof Error ? e.message : "unknown"} - HOA, disclosure, and market-analysis facts could not be extracted.`,
      );
    } catch (e2) {
      console.error("stage3 secondary save failed:", e2);
    }
  } finally {
    try { await saveResultIfMissing(db, jobId, "document_facts", FAILSAFE); } catch (e) { console.error("stage3 failsafe error:", e); }
    await advanceDownstreamGates(db, jobId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();

  // @ts-ignore EdgeRuntime is provided by Supabase edge-runtime
  EdgeRuntime.waitUntil(runDocs(jobId));

  return new Response(JSON.stringify({ ok: true, backgrounded: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

