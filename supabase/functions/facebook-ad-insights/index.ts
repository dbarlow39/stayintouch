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
    const userToken = tokenData.access_token;

    // Try multiple tokens in order: page token first, then user token
    const tokensToTry = [
      { token: pageToken, label: "page" },
      { token: userToken, label: "user" },
    ];

    let postData: any = {};
    let usedToken = "";

    // Try to get post data with engagement summaries
    for (const { token, label } of tokensToTry) {
      if (!token) continue;
      const url = `https://graph.facebook.com/v21.0/${post_id}?fields=likes.summary(true),comments.summary(true),shares,created_time,message,full_picture&access_token=${token}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data.error) {
        postData = data;
        usedToken = label;
        console.log(`[fb-insights] Post data fetched with ${label} token`);
        break;
      } else {
        console.warn(`[fb-insights] ${label} token failed for post data:`, data.error.message);
      }
    }

    // If no engagement data, try basic fields
    if (!postData.created_time) {
      for (const { token, label } of tokensToTry) {
        if (!token) continue;
        const url = `https://graph.facebook.com/v21.0/${post_id}?fields=created_time,message,full_picture&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.error) {
          postData = data;
          usedToken = label;
          break;
        }
      }
    }

    // Try insights with each token
    const metrics: Record<string, any> = {};
    for (const { token, label } of tokensToTry) {
      if (!token) continue;
      try {
        const url = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=post_impressions,post_impressions_unique&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.data && data.data.length > 0) {
          for (const item of data.data) {
            metrics[item.name] = item.values?.[0]?.value;
          }
          console.log(`[fb-insights] Insights fetched with ${label} token`);
          break;
        }
      } catch (_e) {
        // continue
      }
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
      token_used: usedToken,
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
