// Stage 4 SWEEPER. Two-phase backstop:
//   Phase 1 (240s): fill any missing area_* placeholder rows and try to open
//                   the CONFLICTS gate.
//   Phase 2 (+90s): if the conflicts row STILL never appears, write an empty
//                   conflicts row + set status=awaiting_agent so the pipeline
//                   is never wedged. If the job is already at awaiting_agent /
//                   complete / failed, both phases short-circuit.
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

const PHASE1_MS = 240_000;
const PHASE2_MS = 90_000;

async function isTerminal(db: ReturnType<typeof serviceClient>, jobId: string): Promise<boolean> {
  const { data: job } = await db
    .from("marketing_plan_jobs")
    .select("status")
    .eq("id", jobId)
    .single();
  if (!job) return true;
  const s = (job as any).status;
  return s === "complete" || s === "failed" || s === "awaiting_agent";
}

async function sweep(jobId: string) {
  await new Promise((r) => setTimeout(r, PHASE1_MS));
  const db = serviceClient();
  try {
    if (await isTerminal(db, jobId)) return;

    // Phase 1: fill any missing area_* rows.
    const { data: rows1 } = await db
      .from("marketing_plan_results")
      .select("stage")
      .eq("job_id", jobId);
    const have1 = new Set((rows1 || []).map((r: any) => r.stage));
    let filled = 0;
    for (const topic of AREA_TOPICS) {
      const key = `area_${topic}`;
      if (!have1.has(key)) {
        const title = TITLES[topic];
        await saveStageResult(
          db,
          jobId,
          key,
          `## ${title}\n\n> Research unavailable for ${title} (sweeper backstop after ${PHASE1_MS / 1000}s).`,
        );
        filled++;
      }
    }

    // Try to open the CONFLICTS gate now that every required row exists.
    await checkGateAndAdvance(
      db,
      jobId,
      STAGE5_REQUIRED,
      "marketing-plan-conflicts",
      "conflicts_dispatch",
    );
    console.log(`stage4-sweeper phase1: filled ${filled} placeholder(s), tried conflicts gate for job ${jobId}`);
  } catch (e) {
    console.error("stage4-sweeper phase1 error:", e);
  }

  // Phase 2: if conflicts row never appears, advance past it.
  await new Promise((r) => setTimeout(r, PHASE2_MS));
  try {
    if (await isTerminal(db, jobId)) return;

    const { data: rows2 } = await db
      .from("marketing_plan_results")
      .select("stage")
      .eq("job_id", jobId)
      .eq("stage", "conflicts");
    const conflictsPresent = (rows2 || []).length > 0;
    if (conflictsPresent) return;

    console.warn(`stage4-sweeper phase2: conflicts row missing after ${(PHASE1_MS + PHASE2_MS) / 1000}s for job ${jobId}; writing empty row and awaiting agent`);
    await saveStageResult(
      db,
      jobId,
      "conflicts",
      JSON.stringify({ unresolved_items: [] }),
    );
    await db
      .from("marketing_plan_jobs")
      .update({ status: "awaiting_agent", current_stage: "conflicts", updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (e) {
    console.error("stage4-sweeper phase2 error:", e);
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
