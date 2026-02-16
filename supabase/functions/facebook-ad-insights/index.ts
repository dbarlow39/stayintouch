import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id, post_id } = await req.json();

    if (!agent_id || !post_id) {
      throw new Error("agent_id and post_id are required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get the agent's Facebook page access token
    const { data: tokenData, error: tokenError } = await supabase
      .from("facebook_oauth_tokens")
      .select("page_access_token, page_id")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData?.page_access_token) {
      throw new Error("Facebook not connected or page token missing");
    }

    const pageToken = tokenData.page_access_token;

    // Fetch post insights from Facebook Marketing API
    const insightsMetrics = [
      "post_engaged_users",
      "post_impressions",
      "post_impressions_unique",
      "post_clicks",
      "post_reactions_like_total",
      "post_activity_by_action_type",
    ].join(",");

    const insightsUrl = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=${insightsMetrics}&access_token=${pageToken}`;
    const insightsResp = await fetch(insightsUrl);
    const insightsData = await insightsResp.json();

    if (insightsData.error) {
      console.error("[fb-insights] API error:", insightsData.error);
      throw new Error(insightsData.error.message || "Failed to fetch insights");
    }

    // Parse insights into a flat object
    const metrics: Record<string, any> = {};
    if (insightsData.data) {
      for (const item of insightsData.data) {
        const value = item.values?.[0]?.value;
        metrics[item.name] = value;
      }
    }

    // Also fetch basic post data (likes, comments, shares)
    const postUrl = `https://graph.facebook.com/v21.0/${post_id}?fields=likes.summary(true),comments.summary(true),shares,created_time,message,full_picture&access_token=${pageToken}`;
    const postResp = await fetch(postUrl);
    const postData = await postResp.json();

    if (postData.error) {
      console.error("[fb-insights] Post fetch error:", postData.error);
    }

    // Try to get promoted post / ad insights if the post was boosted
    let adInsights: any = null;
    try {
      const adAccountId = "563726213662060"; // Locked ad account
      const adInsightsUrl = `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?filtering=[{"field":"ad.effective_status","operator":"IN","value":["ACTIVE","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED","COMPLETED"]},{"field":"ad.id","operator":"CONTAIN","value":"${post_id}"}]&fields=impressions,reach,clicks,spend,cpc,cpm,cpp,actions,cost_per_action_type&date_preset=lifetime&access_token=${pageToken}`;
      const adResp = await fetch(adInsightsUrl);
      const adData = await adResp.json();
      
      if (adData.data?.length > 0) {
        adInsights = adData.data[0];
      }
    } catch (adErr) {
      console.error("[fb-insights] Ad insights error:", adErr);
    }

    // Also try promoted_object insights via the post's promoted post ID
    let promotedInsights: any = null;
    try {
      const promoUrl = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users,post_clicks_by_type&period=lifetime&access_token=${pageToken}`;
      const promoResp = await fetch(promoUrl);
      const promoData = await promoResp.json();
      
      if (promoData.data) {
        for (const item of promoData.data) {
          const value = item.values?.[0]?.value;
          if (value !== undefined) {
            metrics[item.name] = value;
          }
        }
      }
    } catch (promoErr) {
      console.error("[fb-insights] Promoted insights error:", promoErr);
    }

    // Build response
    const result = {
      post_id,
      created_time: postData.created_time || null,
      message: postData.message || null,
      full_picture: postData.full_picture || null,
      likes: postData.likes?.summary?.total_count || 0,
      comments: postData.comments?.summary?.total_count || 0,
      shares: postData.shares?.count || 0,
      engagements: metrics.post_engaged_users || 0,
      impressions: metrics.post_impressions || 0,
      reach: metrics.post_impressions_unique || 0,
      clicks: metrics.post_clicks || null,
      click_types: metrics.post_clicks_by_type || null,
      activity: metrics.post_activity_by_action_type || null,
      reactions: metrics.post_reactions_like_total || 0,
      // Ad-specific data if boosted
      ad_insights: adInsights ? {
        impressions: parseInt(adInsights.impressions || "0"),
        reach: parseInt(adInsights.reach || "0"),
        clicks: parseInt(adInsights.clicks || "0"),
        spend: parseFloat(adInsights.spend || "0"),
        cpc: parseFloat(adInsights.cpc || "0"),
        cpm: parseFloat(adInsights.cpm || "0"),
        actions: adInsights.actions || [],
        cost_per_action: adInsights.cost_per_action_type || [],
      } : null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[fb-insights] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
