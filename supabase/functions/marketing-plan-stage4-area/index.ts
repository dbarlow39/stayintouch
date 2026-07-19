// Stage 4: area research with server-side web_search / web_fetch tools.
// Backgrounded via EdgeRuntime.waitUntil. Area research is OPTIONAL — any
// failure or timeout advances the pipeline to Stage 5 with a "skipped" note.
//
// =============================================================
// STAGE 4 HARD LIMITS — DO NOT REMOVE OR REDUCE WITHOUT REVIEW.
// These caps have been dropped twice; making them a single named
// constant that the callClaude arguments read from directly.
// =============================================================
const STAGE4_LIMITS = {
  webSearchMaxUses: 5,
  webFetchMaxUses: 3,
  pauseTurnRetries: 2,
  effort: "low" as const,
  // Hard server-side deadline. If Claude hasn't returned within this many
  // ms, we stop waiting, save partial (or "skipped") result, and advance.
  deadlineMs: 100_000,
};

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

const SYSTEM_PROMPT = `You are researching a property's area for a marketing plan that will be presented to the homeowner. Cite a source for every factual claim.

The user message will include a NEIGHBORHOOD SNAPSHOT extracted from the seller's own documents. Those five values (School District, Subdivision, Walkability Score, Crime Risk Score, Flood Zone) are AUTHORITATIVE — do NOT web-search for any of them, and do NOT contradict them. Repeat them in your output with source "Neighborhood Snapshot (documents)".

Do NOT research square footage, year built, beds/baths, or taxes - those come from the property record and MLS.

Restrict web searches to what the documents do NOT already establish:
  - Nearby amenities (grocery, dining, parks, recreation within ~2 miles)
  - Commute and access
  - Recent area developments announced in the last 12 months
  - Market context (recent activity in the immediate area)

Skip any topic already covered by the Neighborhood Snapshot. Never state a figure you could not verify — mark it as unverified instead.

Return Markdown:

## Community
## Location & Commute
## Schools
(Restate the School District from the Neighborhood Snapshot. Do not web-search for ratings.)
## Recreation & Everyday Amenities
## Market Context
## Could Not Verify`;

async function heartbeat(db: ReturnType<typeof serviceClient>, jobId: string) {
  await db
    .from("marketing_plan_jobs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

function extractSnapshot(stage3: string | null | undefined): string {
  if (!stage3) return "";
  // Grab everything from "## Neighborhood Snapshot" up to the next "## " heading.
  const m = stage3.match(/##\s*Neighborhood Snapshot[\s\S]*?(?=\n##\s|$)/i);
  return m ? m[0].trim() : "";
}

async function skipAndAdvance(
  db: ReturnType<typeof serviceClient>,
  jobId: string,
  reason: string,
  partial?: string,
) {
  const content = partial && partial.trim().length > 0
    ? `# Area Research (Stage 4)\n\n> Note: ${reason} — output below is partial.\n\n${partial}`
    : `# Area Research (Stage 4)\n\n> Area research was skipped (${reason}). Neighborhood claims are limited to what the uploaded documents and property record support.`;
  await saveStageResult(db, jobId, "area_research", content);
  await markStage(db, jobId, "marketing_plan", "ready_for_plan");
  // Kick off Stage 5 directly so the pipeline advances even if no UI is watching.
  await invokeNextStage("marketing-plan-stage5-plan", jobId);
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

    const { data: docRes } = await db
      .from("marketing_plan_results")
      .select("content")
      .eq("job_id", jobId)
      .eq("stage", "document_facts")
      .maybeSingle();

    const snapshot = extractSnapshot(docRes?.content);

    const userMsg = `Address: ${lead?.address || ""}, ${lead?.city || ""} ${lead?.state || ""} ${lead?.zip || ""}
Community / Subdivision: ${(lead as any)?.subdivision || "unknown"}

# NEIGHBORHOOD SNAPSHOT (authoritative — do NOT web-search these values)
${snapshot || "(no snapshot available — proceed with normal research)"}

# Property record from Stage 1 (do NOT re-research these fields)
${propRes?.content || "(none)"}`;

    const claudePromise = callClaude({
      model: OPUS_MODEL,
      system: SYSTEM_PROMPT,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: STAGE4_LIMITS.effort },
      maxPauseTurnRetries: STAGE4_LIMITS.pauseTurnRetries,
      onPauseTurn: () => heartbeat(db, jobId),
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: STAGE4_LIMITS.webSearchMaxUses },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: STAGE4_LIMITS.webFetchMaxUses },
      ],
      messages: [{ role: "user", content: userMsg }],
    });

    const timeoutPromise = new Promise<{ __timeout: true }>((resolve) =>
      setTimeout(() => resolve({ __timeout: true }), STAGE4_LIMITS.deadlineMs)
    );

    const winner = await Promise.race([claudePromise, timeoutPromise]);

    if ((winner as any).__timeout) {
      console.warn(`stage4 hit ${STAGE4_LIMITS.deadlineMs}ms deadline — advancing`);
      // Swallow the late Claude result so it can't override our terminal write.
      claudePromise.catch((e) => console.warn("late stage4 claude rejection:", e));
      await skipAndAdvance(db, jobId, "hit 100-second server deadline");
      return;
    }

    const res = winner as Awaited<typeof claudePromise>;
    await saveStageResult(db, jobId, "area_research", `# Area Research (Stage 4)\n\n${res.text}`);
    await markStage(db, jobId, "marketing_plan", "ready_for_plan");
    await invokeNextStage("marketing-plan-stage5-plan", jobId);
  } catch (e) {
    console.error("stage4 background error:", e);
    try {
      await skipAndAdvance(db, jobId, e instanceof Error ? e.message : "unknown error");
    } catch (e2) {
      await failJob(db, jobId, `Stage 4 fatal: ${e2 instanceof Error ? e2.message : "unknown"}`);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();

  // @ts-ignore EdgeRuntime is provided by Supabase edge-runtime
  EdgeRuntime.waitUntil(runAreaResearch(jobId));

  return new Response(JSON.stringify({ ok: true, backgrounded: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
