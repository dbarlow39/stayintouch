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
    const { agent_id, message, photo_url, link } = await req.json();

    if (!agent_id || !message) {
      throw new Error("agent_id and message are required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get stored tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("facebook_oauth_tokens")
      .select("*")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData) {
      throw new Error("Facebook not connected. Please connect your Facebook Page first.");
    }

    const { page_id, page_access_token } = tokenData;

    if (!page_id || !page_access_token) {
      throw new Error("Facebook Page not configured. Please reconnect.");
    }

    let result;

    if (link) {
      // Link share post — creates a clickable card on Facebook
      // Facebook will scrape the OG image from the edge function URL
      const body: any = {
        message,
        link,
        access_token: page_access_token,
      };

      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      result = await postResp.json();
    } else if (photo_url) {
      // Photo-only post (no link)
      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: photo_url,
          message,
          access_token: page_access_token,
        }),
      });
      result = await postResp.json();
    } else {
      // Text-only post
      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          access_token: page_access_token,
        }),
      });
      result = await postResp.json();
    }

    if (result.error) {
      console.error("Facebook post error:", result.error);
      throw new Error(result.error.message || "Failed to post to Facebook");
    }

    return new Response(JSON.stringify({
      success: true,
      post_id: result.id || result.post_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Facebook post error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
