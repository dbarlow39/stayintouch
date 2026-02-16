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

    const { data: tokenData, error: tokenError } = await supabase
      .from("facebook_oauth_tokens")
      .select("page_access_token, page_id, access_token")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData?.page_access_token) {
      throw new Error("Facebook not connected or page token missing");
    }

    const pageToken = tokenData.page_access_token;
    const pageId = tokenData.page_id;
    const debugInfo: string[] = [];

    // Helper to fetch JSON with timeout
    const fetchJson = async (url: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        return await resp.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    // Strategy 1: Get basic post data from published_posts (no engagement fields - they require Page Public Content Access)
    let postData: any = {};
    let usedToken = "page";

    if (pageId) {
      const feedUrl = `https://graph.facebook.com/v21.0/${pageId}/published_posts?fields=id,created_time,message,full_picture,shares&limit=100&access_token=${pageToken}`;
      const feedData = await fetchJson(feedUrl);
      if (!feedData.error && feedData.data) {
        const matched = feedData.data.find((p: any) => p.id === post_id);
        if (matched) {
          postData = matched;
          debugInfo.push(`Feed found post (${feedData.data.length} scanned)`);
        } else {
          debugInfo.push(`Feed: ${feedData.data.length} posts, no match`);
        }
      } else {
        debugInfo.push(`Feed: ${feedData.error?.message?.substring(0, 60) || 'no data'}`);
      }
    }

    // Strategy 2: Get engagement via post insights (these metrics actually work)
    const metrics: Record<string, any> = {};
    try {
      const insightsUrl = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=post_reactions_by_type_total,post_activity_by_action_type&access_token=${pageToken}`;
      const insightsData = await fetchJson(insightsUrl);
      if (insightsData.data?.length > 0) {
        for (const item of insightsData.data) {
          metrics[item.name] = item.values?.[0]?.value;
        }
        debugInfo.push("Insights succeeded");
      } else if (insightsData.error) {
        debugInfo.push(`Insights: ${insightsData.error.message?.substring(0, 60)}`);
      }
    } catch (_e) { /* non-fatal */ }

    // Try Ads API (single call, non-fatal)
    let adInsights: any = null;
    const AD_ACCOUNT_ID = "563726213662060";
    try {
      const adsUrl = `https://graph.facebook.com/v21.0/act_${AD_ACCOUNT_ID}/ads?fields=id,insights.fields(impressions,reach,clicks,spend,cpc,cpm)&filtering=[{"field":"effective_object_story_id","operator":"CONTAIN","value":"${post_id}"}]&access_token=${pageToken}`;
      const adsData = await fetchJson(adsUrl);
      if (!adsData.error && adsData.data?.length > 0 && adsData.data[0].insights?.data?.[0]) {
        adInsights = adsData.data[0].insights.data[0];
        debugInfo.push("Ad insights found");
      } else if (adsData.error) {
        debugInfo.push(`Ads: ${adsData.error.message?.substring(0, 60)}`);
      }
    } catch (_e) { /* non-fatal */ }

    console.log(`[fb-insights] Debug:`, JSON.stringify(debugInfo));

    // Extract reactions from insights (post_reactions_by_type_total returns {like: N, love: N, ...})
    const reactionsObj = metrics.post_reactions_by_type_total || {};
    const totalReactions = Object.values(reactionsObj).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);
    const likes = (reactionsObj.like || 0) + (reactionsObj.love || 0) + (reactionsObj.wow || 0) + (reactionsObj.haha || 0) + (reactionsObj.sorry || 0) + (reactionsObj.anger || 0);

    // Extract activity from insights (post_activity_by_action_type returns {share: N, comment: N, like: N, ...})
    const activityObj = metrics.post_activity_by_action_type || {};
    const comments = activityObj.comment || 0;
    const shares = postData.shares?.count || activityObj.share || 0;
    const totalEngagements = totalReactions + comments + shares;

    const result = {
      post_id,
      created_time: postData.created_time || null,
      message: postData.message || null,
      full_picture: postData.full_picture || null,
      likes: totalReactions,
      comments,
      shares,
      engagements: totalEngagements,
      impressions: adInsights ? parseInt(adInsights.impressions || "0") : 0,
      reach: adInsights ? parseInt(adInsights.reach || "0") : 0,
      clicks: adInsights ? parseInt(adInsights.clicks || "0") : null,
      click_types: null,
      activity: activityObj,
      reactions: reactionsObj,
      ad_insights: adInsights ? {
        impressions: parseInt(adInsights.impressions || "0"),
        reach: parseInt(adInsights.reach || "0"),
        clicks: parseInt(adInsights.clicks || "0"),
        spend: parseFloat(adInsights.spend || "0"),
        cpc: parseFloat(adInsights.cpc || "0"),
        cpm: parseFloat(adInsights.cpm || "0"),
        actions: [],
        cost_per_action: [],
      } : null,
      token_used: usedToken,
      debug: debugInfo,
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
