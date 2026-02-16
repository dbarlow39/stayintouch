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
    const { agent_id, app_origin } = await req.json();

    if (!agent_id) {
      throw new Error("agent_id is required");
    }

    const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID")?.trim();

    if (!FACEBOOK_APP_ID) {
      throw new Error("FACEBOOK_APP_ID not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;
    const scope = "pages_manage_posts,pages_read_engagement,pages_show_list,business_management,read_insights";

    // Encode agent_id and app_origin together in state so the callback knows where to redirect
    const statePayload = JSON.stringify({ agent_id, app_origin: app_origin || "https://stayintouch.lovable.app" });
    const encodedState = btoa(statePayload);

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(encodedState)}`;

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error generating Facebook auth URL:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
