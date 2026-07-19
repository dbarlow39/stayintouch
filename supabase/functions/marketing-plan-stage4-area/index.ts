// Stage 4 DISPATCHER. Performs no research itself. Fans out to seven
// marketing-plan-stage4-worker invocations, one per topic, and schedules a
// sweeper as a backstop. Returns immediately.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  assertInternalOrJobOwner,
  failJob,
  markStage,
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

function extractSnapshot(stage3: string | null | undefined): string {
  if (!stage3) return "";
  const m = stage3.match(/##\s*Neighborhood Snapshot[\s\S]*?(?=\n##\s|$)/i);
  return m ? m[0].trim() : "";
}

function fireAndForget(fnName: string, body: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).catch((e) => console.error(`dispatch(${fnName}) fetch failed:`, e));
  } catch (e) {
    console.error(`dispatch(${fnName}) threw:`, e);
  }
}

async function dispatch(jobId: string) {
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

    const { data: docRes } = await db
      .from("marketing_plan_results")
      .select("content")
      .eq("job_id", jobId)
      .eq("stage", "document_facts")
      .maybeSingle();

    const snapshot = extractSnapshot(docRes?.content);

    const context = {
      address: (lead as any)?.address || "",
      city: (lead as any)?.city || "",
      state: (lead as any)?.state || "",
      zip: (lead as any)?.zip || "",
      subdivision: (lead as any)?.subdivision || "",
      snapshot,
    };

    // Reset counter, record expected count.
    await db
      .from("marketing_plan_jobs")
      .update({
        current_batch: 0,
        expected_area_count: TOPICS.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Fan out.
    for (const topic of TOPICS) {
      fireAndForget("marketing-plan-stage4-worker", { jobId, topic, context });
    }
    // Backstop.
    fireAndForget("marketing-plan-stage4-sweeper", { jobId });
  } catch (e) {
    console.error("stage4 dispatcher error:", e);
    try {
      await failJob(
        serviceClient(),
        jobId,
        `Stage 4 dispatch failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    } catch { /* ignore */ }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = assertInternalCaller(req);
  if (unauth) return unauth;
  const { jobId } = await req.json();
  // @ts-ignore EdgeRuntime
  EdgeRuntime.waitUntil(dispatch(jobId));
  return new Response(
    JSON.stringify({ ok: true, dispatched: TOPICS.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
