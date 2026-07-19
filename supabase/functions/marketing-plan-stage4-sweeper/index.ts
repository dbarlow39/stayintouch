// Stage 4 SWEEPER. Backstop that runs 240s after dispatch. If any topic is
// still missing at that point, upserts a "Research unavailable" placeholder
// and advances the job to Stage 5. Idempotent — safe if all workers finished.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  invokeNextStage,
  markStage,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import { corsHeaders } from "../_shared/marketing-plan-claude.ts";

const TOPICS = [
  "schools",
  "recreation",
  "convenience",
  "commute",
  "community",
  "demographics",
  "market",
] as const;

const TITLES: Record<string, string> = {
  schools: "Schools",
  recreation: "Recreation & Outdoors",
  convenience: "Everyday Convenience",
  commute: "Commute & Access",
  community: "The Community",
  demographics: "Demographics",
  market: "Market Context",
};

const SLEEP_MS = 240_000;

async function sweep(jobId: string) {
  await new Promise((r) => setTimeout(r, SLEEP_MS));
  const db = serviceClient();
  try {
    const { data: job } = await db
      .from("marketing_plan_jobs")
      .select("status, current_stage")
      .eq("id", jobId)
      .single();
    // If it already advanced past area_research, nothing to do.
    if (!job) return;
    if ((job as any).current_stage !== "area_research" &&
        (job as any).current_stage !== "marketing_plan") return;

    const { data: rows } = await db
      .from("marketing_plan_results")
      .select("stage")
      .eq("job_id", jobId);
    const have = new Set((rows || []).map((r: any) => r.stage));

    let filled = 0;
    for (const topic of TOPICS) {
      const key = `area_${topic}`;
      if (!have.has(key)) {
        const title = TITLES[topic];
        await saveStageResult(
          db,
          jobId,
          key,
          `## ${title}\n\n> Research unavailable for ${title} (sweeper backstop after ${SLEEP_MS / 1000}s).`,
        );
        filled++;
      }
    }

    // Only advance if we're not already generating the plan.
    if ((job as any).current_stage === "area_research") {
      await markStage(db, jobId, "marketing_plan", "ready_for_plan");
      await invokeNextStage("marketing-plan-stage5-plan", jobId);
    }
    console.log(`stage4-sweeper filled ${filled} placeholder(s) for job ${jobId}`);
  } catch (e) {
    console.error("stage4-sweeper error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const { jobId } = await req.json();
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil(sweep(jobId));
  return new Response(JSON.stringify({ ok: true, scheduled: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
