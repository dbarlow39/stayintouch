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

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!GOOGLE_CLIENT_ID) {
      throw new Error("GOOGLE_CLIENT_ID not configured");
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;
    const scope = encodeURIComponent(
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email"
    );

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&state=${agent_id}&access_type=offline&prompt=consent`;

    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error generating auth URL:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
