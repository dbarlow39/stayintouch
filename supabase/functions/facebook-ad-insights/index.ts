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

    // Fetch post data - try with engagement summaries first, fall back to basic fields
    let postData: any = {};
    
    // Try full fields including engagement
    const fullUrl = `https://graph.facebook.com/v21.0/${post_id}?fields=likes.summary(true),comments.summary(true),shares,created_time,message,full_picture&access_token=${pageToken}`;
    const fullResp = await fetch(fullUrl);
    const fullData = await fullResp.json();

    if (!fullData.error) {
      postData = fullData;
    } else {
      console.warn("[fb-insights] Full post fetch failed:", fullData.error.message);
      // Fall back to basic fields only
      const basicUrl = `https://graph.facebook.com/v21.0/${post_id}?fields=created_time,message,full_picture&access_token=${pageToken}`;
      const basicResp = await fetch(basicUrl);
      const basicData = await basicResp.json();
      if (!basicData.error) {
        postData = basicData;
      } else {
        console.warn("[fb-insights] Basic post fetch also failed:", basicData.error.message);
      }
    }

    // Try insights (non-fatal)
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
    } catch (_e) {
      // Silently ignore
    }

    const likes = postData.likes?.summary?.total_count || 0;
    const comments = postData.comments?.summary?.total_count || 0;
    const shares = postData.shares?.count || 0;
    const totalEngagements = likes + comments + shares;

    const result = {
      post_id,
      created_time: postData.created_time || null,
      message: postData.message || null,
      full_picture: postData.full_picture || null,
      likes,
      comments,
      shares,
      engagements: totalEngagements,
      impressions: metrics.post_impressions || 0,
      reach: metrics.post_impressions_unique || 0,
      clicks: null,
      click_types: null,
      activity: null,
      reactions: likes,
      ad_insights: null,
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
