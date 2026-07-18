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

export async function invokeNextStage(functionName: string, jobId: string): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${functionName}`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // Fire-and-forget (do not await response body). We still await the initial dispatch
  // so any immediate error surfaces in logs.
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
