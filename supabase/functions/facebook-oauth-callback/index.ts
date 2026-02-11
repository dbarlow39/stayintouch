import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, agent_id } = await req.json();

    if (!code || !agent_id) {
      throw new Error("code and agent_id are required");
    }

    const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID");
    const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      throw new Error("Facebook OAuth credentials not configured");
    }

    const redirectUri = "https://stayintouch.lovable.app/dashboard";

    // Exchange code for user access token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error);
      throw new Error(tokenData.error.message || "Token exchange failed");
    }

    const userAccessToken = tokenData.access_token;

    // Get long-lived token
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${userAccessToken}`;
    const longLivedResp = await fetch(longLivedUrl);
    const longLivedData = await longLivedResp.json();
    const longLivedToken = longLivedData.access_token || userAccessToken;

    // Get user's pages
    const pagesResp = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`);
    const pagesData = await pagesResp.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error("No Facebook Pages found. Make sure you have admin access to a Facebook Page.");
    }

    // Use the first page (most common scenario)
    const page = pagesData.data[0];
    const pageAccessToken = page.access_token;
    const pageId = page.id;
    const pageName = page.name;

    // Store in database
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { error: upsertError } = await supabase
      .from("facebook_oauth_tokens")
      .upsert({
        agent_id,
        access_token: longLivedToken,
        page_id: pageId,
        page_name: pageName,
        page_access_token: pageAccessToken,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id" });

    if (upsertError) {
      console.error("Database error:", upsertError);
      throw upsertError;
    }

    return new Response(JSON.stringify({
      success: true,
      page_name: pageName,
      pages: pagesData.data.map((p: any) => ({ id: p.id, name: p.name })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Facebook OAuth callback error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
