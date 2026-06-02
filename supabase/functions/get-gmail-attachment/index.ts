// Returns a single Gmail attachment as base64 for the authenticated agent.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function getAccessToken(supabase: any, agentId: string): Promise<string> {
  const { data: tokenData, error } = await supabase
    .from("gmail_oauth_tokens").select("*").eq("agent_id", agentId).single();
  if (error || !tokenData) throw new Error("Gmail not connected");

  let accessToken = tokenData.access_token;
  if (new Date(tokenData.token_expiry) < new Date()) {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const rd = await r.json();
    if (!r.ok) throw new Error("Failed to refresh Gmail token");
    accessToken = rd.access_token;
    await supabase.from("gmail_oauth_tokens").update({
      access_token: accessToken,
      token_expiry: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_id", agentId);
  }
  return accessToken;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const agentId = claims.claims.sub;

    const { message_id, attachment_id } = await req.json();
    if (!message_id || !attachment_id) {
      return new Response(JSON.stringify({ error: "message_id and attachment_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(supabase, agentId);
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message_id}/attachments/${attachment_id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "Gmail fetch failed", details: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await r.json();
    // data.data is base64url-encoded — convert to standard base64
    const b64 = (data.data || "").replace(/-/g, "+").replace(/_/g, "/");
    return new Response(JSON.stringify({ data_base64: b64, size: data.size || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
