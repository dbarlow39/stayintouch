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

    if (photo_url && link) {
      // Strategy: Post as a LINK post where the og:image is the branded ad image.
      // The link points to the og-listing edge function with &img= param,
      // so Facebook's scraper picks up the branded image as the OG image
      // and shows the link preview card underneath.

      // Build the OG link URL with the custom image parameter
      const ogLinkUrl = `${link}${link.includes("?") ? "&" : "?"}img=${encodeURIComponent(photo_url)}`;

      // Step 1: Force Facebook to scrape/re-scrape the URL so it picks up the branded image
      console.log("[FB] Force-scraping OG URL:", ogLinkUrl);
      try {
        const scrapeResp = await fetch(
          `https://graph.facebook.com/v21.0/?id=${encodeURIComponent(ogLinkUrl)}&scrape=true&access_token=${page_access_token}`,
          { method: "POST" }
        );
        const scrapeResult = await scrapeResp.json();
        console.log("[FB] Scrape result:", JSON.stringify(scrapeResult));
      } catch (scrapeErr) {
        console.warn("[FB] Scrape warning (non-fatal):", scrapeErr);
      }

      // Step 2: Post as a link post - Facebook will use the scraped OG tags
      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          link: ogLinkUrl,
          access_token: page_access_token,
        }),
      });
      result = await postResp.json();
    } else if (photo_url) {
      // Photo post (no link) — shows the branded ad image prominently
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
