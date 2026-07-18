// Stage 3: extract facts from uploaded HOA / disclosure PDFs (Claude Opus).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  failJob,
  invokeNextStage,
  markStage,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import {
  callClaude,
  corsHeaders,
  OPUS_MODEL,
  type Block,
} from "../_shared/marketing-plan-claude.ts";

const SYSTEM_PROMPT = `You are extracting hard facts from real estate association and disclosure documents so an agent can market a listing accurately. Quote the document and page for every fact. If a fact is not present, write "NOT FOUND - must confirm." Never estimate or infer a number. Return Markdown:

## HOA Dues
Exact monthly or annual amount and precisely what it covers; note anything billed separately to the owner such as water, sewer, gas, or electric.

## Age Restriction
Is the community LEGALLY deed-restricted 55+ (housing for older persons), or merely age-targeted marketing? Quote the governing document. This is a Fair Housing matter - never guess. Also note rental and leasing limits.

## Amenities Confirmed
Which amenities the documents actually establish exist.

## Home Features
Square footage, year built, flooring, kitchen, primary suite, basement or the absence of one, garage, outdoor spaces. Treat any seller-written description as CLAIMS to verify, clearly labeled as such.

## Material Facts
Systems, age, repairs, water and sewer, radon, flood plain, defects.

## Numbers To Verify
Every figure that should be checked against the MLS or county.`;

async function fetchDoc(db: any, storagePath: string): Promise<{ media_type: string; data: string } | null> {
  try {
    const { data, error } = await db.storage.from("marketing-plan-docs").download(storagePath);
    if (error || !data) return null;
    const buf = new Uint8Array(await data.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    return { media_type: "application/pdf", data: btoa(bin) };
  } catch (_) {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();
  const db = serviceClient();

  try {
    await markStage(db, jobId, "document_facts", "running");

    const { data: docs } = await db
      .from("marketing_plan_documents")
      .select("id, storage_path, doc_type, filename")
      .eq("job_id", jobId);

    if (!docs || docs.length === 0) {
      await saveStageResult(
        db,
        jobId,
        "document_facts",
        "# Document Facts (Stage 3)\n\n> No documents uploaded — HOA, disclosure, and other governing document facts could not be verified.",
      );
      await invokeNextStage("marketing-plan-stage4-area", jobId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build one call with all docs; each preceded by a text block. Cap per-call bytes.
    const MAX_BYTES = 25 * 1024 * 1024;
    const groups: Block[][] = [[]];
    let groupBytes = 0;
    for (const d of docs) {
      const doc = await fetchDoc(db, d.storage_path);
      if (!doc) continue;
      const approxBytes = doc.data.length; // base64 length is upper bound on encoded size
      if (groupBytes + approxBytes > MAX_BYTES && groups[groups.length - 1].length > 0) {
        groups.push([]);
        groupBytes = 0;
      }
      const g = groups[groups.length - 1];
      g.push({ type: "text", text: `Filename: ${d.filename} — Type: ${d.doc_type}` });
      g.push({
        type: "document",
        source: { type: "base64", media_type: doc.media_type, data: doc.data },
      });
      groupBytes += approxBytes;
    }

    const outputs: string[] = [];
    for (const blocks of groups) {
      if (blocks.length === 0) continue;
      blocks.push({
        type: "text",
        text: "Return the full Markdown report described in the system prompt for all attached documents.",
      });
      const res = await callClaude({
        model: OPUS_MODEL,
        system: SYSTEM_PROMPT,
        max_tokens: 12000,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        messages: [{ role: "user", content: blocks }],
      });
      outputs.push(res.text);
    }

    const merged = outputs.length === 1
      ? outputs[0]
      : (await callClaude({
          model: OPUS_MODEL,
          system: "Merge these batch outputs into a single Markdown report under the same six headings. Preserve every document quote and page reference.",
          max_tokens: 12000,
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
          messages: [{
            role: "user",
            content: outputs.map((o, i) => `--- BATCH ${i + 1} ---\n${o}`).join("\n\n"),
          }],
        })).text;

    await saveStageResult(db, jobId, "document_facts", `# Document Facts (Stage 3)\n\n${merged}`);
    await invokeNextStage("marketing-plan-stage4-area", jobId);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stage3 error:", e);
    try {
      await saveStageResult(
        db,
        jobId,
        "document_facts",
        `# Document Facts (Stage 3)\n\n> Stage failed: ${e instanceof Error ? e.message : "unknown"} — HOA and disclosure facts could not be extracted.`,
      );
      await invokeNextStage("marketing-plan-stage4-area", jobId);
    } catch (e2) {
      await failJob(db, jobId, `Stage 3 fatal: ${e2 instanceof Error ? e2.message : "unknown"}`);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
