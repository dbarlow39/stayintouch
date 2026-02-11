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

    if (!agent_id) {
      throw new Error("agent_id is required");
    }

    const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID");

    if (!FACEBOOK_APP_ID) {
      throw new Error("FACEBOOK_APP_ID not configured");
    }

    const redirectUri = "https://stayintouch.lovable.app/dashboard";
    const scope = "pages_manage_posts,pages_read_engagement";

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${agent_id}`;

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
