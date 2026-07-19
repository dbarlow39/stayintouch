// Shared helpers for the marketing plan pipeline: auth, service client, stage chaining.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function authUser(req: Request): Promise<{ userId: string; token: string } | null> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const c = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await c.auth.getUser();
  if (error || !data.user) return null;
  return { userId: data.user.id, token };
}

// Verifies the caller is an internal pipeline dispatch. Accepts either the
// service-role bearer token (used by invokeNextStage / invokeNextStageAwaited)
// or, as a future-proof secondary path, an `x-internal-secret` header equal to
// the service-role key. Returns null when authorized, or a 401 Response
// otherwise. Every stage entrypoint that is invoked internally must call this.
export function assertInternalCaller(req: Request): Response | null {
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const secretHeader = (req.headers.get("x-internal-secret") || "").trim();
  const ok = svcKey.length > 0 && (auth === svcKey || secretHeader === svcKey);
  if (ok) return null;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  };
  return new Response(JSON.stringify({ error: "Unauthorized (internal only)" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Fire-and-forget invoke. Does not throw on network failure; errors are logged.
export function invokeNextStage(functionName: string, jobId: string): void {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jobId }),
    }).catch((e) => console.error(`invokeNextStage(${functionName}) fetch failed:`, e));
  } catch (e) {
    console.error(`invokeNextStage(${functionName}) threw:`, e);
  }
}

// Awaited invoke — used by the gate helper so the caller can release the gate
// if the dispatch itself throws before the next function accepts the request.
export async function invokeNextStageAwaited(functionName: string, jobId: string): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`invoke ${functionName} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
}

export async function markStage(
  db: SupabaseClient,
  jobId: string,
  stage: string,
  status: string,
): Promise<void> {
  await db
    .from("marketing_plan_jobs")
    .update({ current_stage: stage, status, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function saveStageResult(
  db: SupabaseClient,
  jobId: string,
  stage: string,
  content: string,
): Promise<void> {
  await db
    .from("marketing_plan_results")
    .upsert({ job_id: jobId, stage, content }, { onConflict: "job_id,stage" });
}

// Writes an "unavailable" placeholder ONLY if no row exists for this stage.
// Used as the last-ditch guarantee that every code path leaves a row behind.
export async function saveResultIfMissing(
  db: SupabaseClient,
  jobId: string,
  stage: string,
  content: string,
): Promise<void> {
  const { data } = await db
    .from("marketing_plan_results")
    .select("stage")
    .eq("job_id", jobId)
    .eq("stage", stage)
    .maybeSingle();
  if (!data) {
    await saveStageResult(db, jobId, stage, content);
  }
}

export async function failJob(
  db: SupabaseClient,
  jobId: string,
  err: string,
): Promise<void> {
  await db
    .from("marketing_plan_jobs")
    .update({ status: "failed", error: err.slice(0, 2000), updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

// Atomically increments the area-research completion counter and reports
// whether this call was the last one (count === expected). Uses the
// mp_increment_area_completed RPC so concurrent workers cannot race.
export async function incrementAreaCompleted(
  db: SupabaseClient,
  jobId: string,
  expected: number,
): Promise<{ newCount: number; isLast: boolean }> {
  const { data, error } = await db.rpc("mp_increment_area_completed", { p_job_id: jobId });
  if (error) throw error;
  const newCount = typeof data === "number" ? data : Number(data);
  return { newCount, isLast: newCount >= expected };
}

// --- Gate helpers (DAG advancement) ------------------------------------------

async function tryClaimGate(
  db: SupabaseClient,
  jobId: string,
  gateName: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("mp_try_claim_gate", {
    p_job_id: jobId,
    p_gate: gateName,
  });
  if (error) {
    console.error(`tryClaimGate(${gateName}) error:`, error);
    return false;
  }
  return !!data;
}

async function releaseGate(
  db: SupabaseClient,
  jobId: string,
  gateName: string,
): Promise<void> {
  try {
    await db.rpc("mp_release_gate", { p_job_id: jobId, p_gate: gateName });
  } catch (e) {
    console.error(`releaseGate(${gateName}) error:`, e);
  }
}

/**
 * Reads the current set of `marketing_plan_results.stage` values for the job.
 * If every required stage is present, atomically claims the named gate and
 * invokes `nextFn`. If the invoke throws, the gate is released so a
 * subsequent caller (or the global sweeper) can retry.
 *
 * Callers of this helper should treat it as a no-op when a required stage is
 * still missing. It returns true only when this call actually dispatched.
 */
export async function checkGateAndAdvance(
  db: SupabaseClient,
  jobId: string,
  requiredStages: string[],
  nextFn: string,
  gateName: string,
): Promise<boolean> {
  const { data: rows } = await db
    .from("marketing_plan_results")
    .select("stage")
    .eq("job_id", jobId);
  const have = new Set((rows || []).map((r: any) => r.stage));
  for (const s of requiredStages) {
    if (!have.has(s)) return false;
  }

  const claimed = await tryClaimGate(db, jobId, gateName);
  if (!claimed) return false;

  try {
    await invokeNextStageAwaited(nextFn, jobId);
    return true;
  } catch (e) {
    console.error(`checkGateAndAdvance(${gateName} -> ${nextFn}) invoke failed:`, e);
    await releaseGate(db, jobId, gateName);
    return false;
  }
}
