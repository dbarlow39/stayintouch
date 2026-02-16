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
    const pageId = tokenData.page_id;

    const tokensToTry = [
      { token: pageToken, label: "page" },
      { token: userToken, label: "user" },
    ];

    let postData: any = {};
    let usedToken = "";
    let debugInfo: string[] = [];

    // Strategy 1: Direct post access with engagement
    for (const { token, label } of tokensToTry) {
      if (!token) continue;
      const url = `https://graph.facebook.com/v21.0/${post_id}?fields=likes.summary(true),comments.summary(true),shares,created_time,message,full_picture&access_token=${token}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (!data.error) {
        postData = data;
        usedToken = label;
        debugInfo.push(`Strategy 1 succeeded with ${label}`);
        break;
      } else {
        debugInfo.push(`S1 ${label}: ${data.error.message?.substring(0, 80)}`);
      }
    }

    // Strategy 2: Page feed with engagement fields
    if (!postData.created_time && pageId) {
      for (const { token, label } of tokensToTry) {
        if (!token) continue;
        const url = `https://graph.facebook.com/v21.0/${pageId}/published_posts?fields=id,created_time,message,full_picture,likes.summary(true),comments.summary(true),shares&limit=100&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.error && data.data) {
          const matched = data.data.find((p: any) => p.id === post_id);
          if (matched) {
            postData = matched;
            usedToken = label;
            debugInfo.push(`Strategy 2 (feed+engagement) found post with ${label}`);
            break;
          } else {
            debugInfo.push(`S2 ${label}: feed ok (${data.data.length} posts) but post not in batch`);
          }
        } else {
          debugInfo.push(`S2 ${label}: ${data.error?.message?.substring(0, 80) || 'no data'}`);
        }
      }
    }

    // Strategy 3: Page feed basic (no engagement fields)
    if (!postData.created_time && pageId) {
      for (const { token, label } of tokensToTry) {
        if (!token) continue;
        const url = `https://graph.facebook.com/v21.0/${pageId}/published_posts?fields=id,created_time,message,full_picture&limit=100&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.error && data.data) {
          const matched = data.data.find((p: any) => p.id === post_id);
          if (matched) {
            postData = matched;
            usedToken = label;
            debugInfo.push(`Strategy 3 (feed basic) found post with ${label}`);
            break;
          }
        }
      }
    }

    // Strategy 4: Minimal direct access
    if (!postData.created_time) {
      for (const { token, label } of tokensToTry) {
        if (!token) continue;
        const url = `https://graph.facebook.com/v21.0/${post_id}?fields=created_time,message&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (!data.error) {
          postData = data;
          usedToken = label;
          debugInfo.push(`Strategy 4 (minimal) succeeded with ${label}`);
          break;
        }
      }
    }

    // Try insights with different metric sets (non-fatal)
    const metrics: Record<string, any> = {};
    const metricSets = [
      "post_impressions,post_impressions_unique,post_engaged_users",
      "post_impressions,post_impressions_unique",
    ];
    
    for (const metricSet of metricSets) {
      let found = false;
      for (const { token, label } of tokensToTry) {
        if (!token) continue;
        try {
          const url = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=${metricSet}&access_token=${token}`;
          const resp = await fetch(url);
          const data = await resp.json();
          if (data.data && data.data.length > 0) {
            for (const item of data.data) {
              metrics[item.name] = item.values?.[0]?.value;
            }
            debugInfo.push(`Insights [${metricSet.substring(0, 30)}...] with ${label}`);
            found = true;
            break;
          } else if (data.error) {
            debugInfo.push(`Insights ${label}: ${data.error.message?.substring(0, 60)}`);
          }
        } catch (_e) { /* continue */ }
      }
      if (found) break;
    }

    console.log(`[fb-insights] Debug:`, JSON.stringify(debugInfo));

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
      activity: metrics.post_engaged_users || null,
      reactions: likes,
      ad_insights: null,
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
