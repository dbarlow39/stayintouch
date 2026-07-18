// Stage 4: area research with server-side web_search / web_fetch tools.
// Backgrounded via EdgeRuntime.waitUntil so the edge function request wall-clock
// does not kill Opus mid-run. Area research is optional evidence — a failure
// still advances the pipeline to stage 5.
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

async function heartbeat(db: ReturnType<typeof serviceClient>, jobId: string) {
  await db
    .from("marketing_plan_jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function runAreaResearch(jobId: string) {
  const db = serviceClient();
  try {
    await markStage(db, jobId, "area_research", "running");
    await heartbeat(db, jobId);

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
      output_config: { effort: "low" },
      maxPauseTurnRetries: 2,
      onPauseTurn: () => heartbeat(db, jobId),
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 5 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    await saveStageResult(db, jobId, "area_research", `# Area Research (Stage 4)\n\n${res.text}`);
    await markStage(db, jobId, "marketing_plan", "ready_for_plan");
  } catch (e) {
    console.error("stage4 background error:", e);
    // Non-fatal: still advance to stage 5 with a note so the plan can be produced.
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
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();

  // Detach heavy work from the request wall-clock. Errors flip the job status
  // via failJob inside runAreaResearch. NOTE: an isolate CPU-limit kill will
  // NOT throw — the 3-minute stall detector on updated_at is the backstop.
  // @ts-ignore EdgeRuntime is provided by Supabase edge-runtime
  EdgeRuntime.waitUntil(runAreaResearch(jobId));

  return new Response(JSON.stringify({ ok: true, backgrounded: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
