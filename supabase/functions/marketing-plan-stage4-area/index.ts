// Stage 4: area research with server-side web_search / web_fetch tools.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  failJob,
  markStage,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import {
  callClaude,
  corsHeaders,
  OPUS_MODEL,
} from "../_shared/marketing-plan-claude.ts";

const SYSTEM_PROMPT = `You are researching a property's area for a marketing plan that will be presented to the homeowner. Use web search for the community, surrounding area, schools, and nearby amenities. Cite a source for every factual claim.

Do NOT research square footage, year built, beds/baths, or taxes - those come from the property record and MLS, which outrank anything you find online. Focus on neighborhood character, school district, commute and access, recreation, dining, and market context.

Never state a figure you could not verify - mark it as unverified instead.

Return Markdown:

## Community
## Location & Commute
## Schools
## Recreation & Everyday Amenities
## Market Context
## Could Not Verify`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();
  const db = serviceClient();

  try {
    await markStage(db, jobId, "area_research", "running");

    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("seller_lead_id")
      .eq("id", jobId)
      .single();
    if (!job) throw new Error("job not found");

    const { data: lead } = await db
      .from("leads")
      .select("address, city, state, zip, subdivision")
      .eq("id", job.seller_lead_id)
      .single();

    const { data: propRes } = await db
      .from("marketing_plan_results")
      .select("content")
      .eq("job_id", jobId)
      .eq("stage", "property_data")
      .maybeSingle();

    const userMsg = `Address: ${lead?.address || ""}, ${lead?.city || ""} ${lead?.state || ""} ${lead?.zip || ""}
Community / Subdivision: ${(lead as any)?.subdivision || "unknown"}

Property record from Stage 1 (do NOT re-research the fields listed here):

${propRes?.content || "(none)"}`;

    const res = await callClaude({
      model: OPUS_MODEL,
      system: SYSTEM_PROMPT,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [
        { type: "web_search_20260209", name: "web_search" },
        { type: "web_fetch_20260209", name: "web_fetch" },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    await saveStageResult(db, jobId, "area_research", `# Area Research (Stage 4)\n\n${res.text}`);
    // Mark ready for the streamed stage 5, which the frontend triggers directly.
    await markStage(db, jobId, "marketing_plan", "ready_for_plan");

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("stage4 error:", e);
    // Non-fatal per spec; continue to stage 5 with a note.
    try {
      await saveStageResult(
        db,
        jobId,
        "area_research",
        `# Area Research (Stage 4)\n\n> Stage failed: ${e instanceof Error ? e.message : "unknown"} — area research could not be completed.`,
      );
      await markStage(db, jobId, "marketing_plan", "ready_for_plan");
    } catch (e2) {
      await failJob(db, jobId, `Stage 4 fatal: ${e2 instanceof Error ? e2.message : "unknown"}`);
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
