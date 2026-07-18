// Shared auth verification for edge functions.
// Returns { ok: true, userId } on success; returns a Response(401) on failure.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function unauthorized(msg = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Requires a valid Supabase user JWT. Returns userId, or a 401 Response.
 */
export async function requireUser(
  req: Request,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return unauthorized();
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return unauthorized("Auth not configured");
  const client = createClient(url, anon);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return unauthorized();
  return { userId: data.user.id };
}

/**
 * Accepts a valid user JWT OR the service role key (for edge-to-edge calls).
 */
export async function requireUserOrServiceRole(
  req: Request,
): Promise<{ userId: string | null; isService: boolean } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return unauthorized();
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (service && token === service) return { userId: null, isService: true };
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return unauthorized("Auth not configured");
  const client = createClient(url, anon);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return unauthorized();
  return { userId: data.user.id, isService: false };
}
