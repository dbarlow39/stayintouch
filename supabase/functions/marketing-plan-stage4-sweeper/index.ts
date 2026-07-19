// Stage 4 SWEEPER. Backstop that runs 240s after dispatch. If any topic is
// still missing at that point, upserts a "Research unavailable" placeholder
// and advances the job to Stage 5. Idempotent — safe if all workers finished.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalCaller,
  checkGateAndAdvance,
  saveStageResult,
  serviceClient,
} from "../_shared/marketing-plan-common.ts";
import { corsHeaders } from "../_shared/marketing-plan-claude.ts";
import { AREA_TOPICS, STAGE5_REQUIRED } from "../_shared/marketing-plan-gates.ts";

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
      .select("status")
      .eq("id", jobId)
      .single();
    if (!job) return;
    // If the plan is already generated or the job failed, do nothing.
    if ((job as any).status === "complete" || (job as any).status === "failed") return;

    const { data: rows } = await db
      .from("marketing_plan_results")
      .select("stage")
      .eq("job_id", jobId);
    const have = new Set((rows || []).map((r: any) => r.stage));

    let filled = 0;
    for (const topic of AREA_TOPICS) {
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

    // Now that every required row exists, try the Stage 5 gate. Atomic —
    // no-op if a worker already opened it.
    await checkGateAndAdvance(db, jobId, STAGE5_REQUIRED, "marketing-plan-stage5-plan", "stage5_dispatch");
    console.log(`stage4-sweeper filled ${filled} placeholder(s) for job ${jobId}`);
  } catch (e) {
    console.error("stage4-sweeper error:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = assertInternalCaller(req);
  if (unauth) return unauth;
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
