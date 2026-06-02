import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id } = await req.json();
    if (!agent_id) throw new Error("agent_id is required");

    const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!DROPBOX_APP_KEY) throw new Error("DROPBOX_APP_KEY not configured");

    const redirectUri = `${SUPABASE_URL}/functions/v1/dropbox-oauth-callback`;
    const authUrl =
      `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}` +
      `&response_type=code&token_access_type=offline` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${agent_id}`;

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Dropbox auth URL error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
