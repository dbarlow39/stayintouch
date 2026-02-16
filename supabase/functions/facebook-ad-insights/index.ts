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
      .select("page_access_token, page_id")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData?.page_access_token) {
      throw new Error("Facebook not connected or page token missing");
    }

    const pageToken = tokenData.page_access_token;
    const pageId = tokenData.page_id;

    // 1) Try basic post data (may fail without pages_read_engagement)
    let postData: any = {};
    try {
      const postUrl = `https://graph.facebook.com/v21.0/${post_id}?fields=likes.summary(true),comments.summary(true),shares,created_time,message,full_picture&access_token=${pageToken}`;
      const postResp = await fetch(postUrl);
      const pd = await postResp.json();
      if (!pd.error) {
        postData = pd;
      } else {
        console.warn("[fb-insights] Post data warning:", pd.error.message);
        // Try minimal fields without engagement data
        const minUrl = `https://graph.facebook.com/v21.0/${post_id}?fields=created_time,message,full_picture&access_token=${pageToken}`;
        const minResp = await fetch(minUrl);
        const minData = await minResp.json();
        if (!minData.error) postData = minData;
      }
    } catch (e) {
      console.warn("[fb-insights] Post fetch failed:", e);
    }

    // 2) Try post insights (non-fatal)
    const metrics: Record<string, any> = {};
    try {
      const insightsUrl = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=post_impressions,post_impressions_unique&access_token=${pageToken}`;
      const insightsResp = await fetch(insightsUrl);
      const insightsData = await insightsResp.json();
      if (insightsData.data) {
        for (const item of insightsData.data) {
          metrics[item.name] = item.values?.[0]?.value;
        }
      }
    } catch (e) {
      console.warn("[fb-insights] Insights failed:", e);
    }

    // 3) Query ad account for boosted post data using effective_object_story_id
    let adInsights: any = null;
    try {
      const adAccountId = "563726213662060";
      // Search for ads that promote this specific post
      const adsUrl = `https://graph.facebook.com/v21.0/act_${adAccountId}/ads?filtering=[{"field":"effective_object_story_id","operator":"CONTAIN","value":"${post_id}"}]&fields=id,name,effective_object_story_id&access_token=${pageToken}&limit=10`;
      const adsResp = await fetch(adsUrl);
      const adsData = await adsResp.json();
      
      console.log("[fb-insights] Ads search result:", JSON.stringify(adsData));

      if (adsData.data?.length > 0) {
        // Get insights for the first matching ad
        const adId = adsData.data[0].id;
        const adInsightsUrl = `https://graph.facebook.com/v21.0/${adId}/insights?fields=impressions,reach,clicks,spend,cpc,cpm,actions,cost_per_action_type&date_preset=maximum&access_token=${pageToken}`;
        const aiResp = await fetch(adInsightsUrl);
        const aiData = await aiResp.json();
        if (aiData.data?.length > 0) {
          adInsights = aiData.data[0];
        }
      } else {
        // Fallback: try searching by the page_id + post portion
        const postPart = post_id.includes('_') ? post_id.split('_')[1] : post_id;
        const storyId = `${pageId}_${postPart}`;
        if (storyId !== post_id) {
          const fallbackUrl = `https://graph.facebook.com/v21.0/act_${adAccountId}/ads?filtering=[{"field":"effective_object_story_id","operator":"CONTAIN","value":"${storyId}"}]&fields=id,name&access_token=${pageToken}&limit=10`;
          const fbResp = await fetch(fallbackUrl);
          const fbData = await fbResp.json();
          console.log("[fb-insights] Fallback ads search:", JSON.stringify(fbData));
          
          if (fbData.data?.length > 0) {
            const adId = fbData.data[0].id;
            const aiUrl = `https://graph.facebook.com/v21.0/${adId}/insights?fields=impressions,reach,clicks,spend,cpc,cpm,actions,cost_per_action_type&date_preset=maximum&access_token=${pageToken}`;
            const aiResp = await fetch(aiUrl);
            const aiData = await aiResp.json();
            if (aiData.data?.length > 0) {
              adInsights = aiData.data[0];
            }
          }
        }

        // Final fallback: get all recent ad insights and see if any match
        if (!adInsights) {
          const allAdsUrl = `https://graph.facebook.com/v21.0/act_${adAccountId}/insights?fields=impressions,reach,clicks,spend,cpc,cpm,actions,cost_per_action_type,ad_id,ad_name&date_preset=maximum&level=ad&limit=50&access_token=${pageToken}`;
          const allResp = await fetch(allAdsUrl);
          const allData = await allResp.json();
          console.log("[fb-insights] All ads count:", allData.data?.length || 0);
        }
      }
    } catch (adErr) {
      console.error("[fb-insights] Ad insights error:", adErr);
    }

    // Build response
    const likes = postData.likes?.summary?.total_count || 0;
    const comments = postData.comments?.summary?.total_count || 0;
    const shares = postData.shares?.count || 0;

    // Prefer ad insights for engagement/impressions if available
    const adEngagements = adInsights?.actions?.find((a: any) => a.action_type === "post_engagement")?.value;
    const totalEngagements = adEngagements ? parseInt(adEngagements) : (likes + comments + shares);

    const result = {
      post_id,
      created_time: postData.created_time || null,
      message: postData.message || null,
      full_picture: postData.full_picture || null,
      likes,
      comments,
      shares,
      engagements: totalEngagements,
      impressions: adInsights ? parseInt(adInsights.impressions || "0") : (metrics.post_impressions || 0),
      reach: adInsights ? parseInt(adInsights.reach || "0") : (metrics.post_impressions_unique || 0),
      clicks: adInsights ? parseInt(adInsights.clicks || "0") : null,
      click_types: null,
      activity: null,
      reactions: likes,
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
