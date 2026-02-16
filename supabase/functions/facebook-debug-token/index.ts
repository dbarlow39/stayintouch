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
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: tokenData } = await supabase
      .from("facebook_oauth_tokens")
      .select("page_access_token, page_id, access_token")
      .eq("agent_id", agent_id)
      .single();

    if (!tokenData?.page_access_token) throw new Error("No token");

    const token = tokenData.page_access_token;
    const results: Record<string, any> = {};

    // Test each metric individually
    const metrics = [
      'post_impressions',
      'post_impressions_unique',
      'post_impressions_paid',
      'post_impressions_organic',
      'post_engaged_users',
      'post_clicks',
      'post_clicks_by_type',
      'post_reactions_by_type_total',
      'post_activity_by_action_type',
      'post_engaged_fan',
      'post_negative_feedback',
      'post_negative_feedback_by_type',
    ];

    for (const metric of metrics) {
      try {
        const url = `https://graph.facebook.com/v21.0/${post_id}/insights?metric=${metric}&access_token=${token}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.error) {
          results[metric] = { error: data.error.message?.substring(0, 100) };
        } else if (data.data?.length > 0) {
          results[metric] = { value: data.data[0].values?.[0]?.value, title: data.data[0].title };
        } else {
          results[metric] = { empty: true };
        }
      } catch (e) {
        results[metric] = { exception: String(e).substring(0, 80) };
      }
    }

    // Also try getting the post directly with engagement fields
    try {
      const directUrl = `https://graph.facebook.com/v21.0/${post_id}?fields=id,message,created_time,shares,likes.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique,post_clicks_by_type)&access_token=${token}`;
      const resp = await fetch(directUrl);
      const data = await resp.json();
      results['_direct_post'] = data.error ? { error: data.error.message?.substring(0, 100) } : {
        shares: data.shares,
        likes_count: data.likes?.summary?.total_count,
        comments_count: data.comments?.summary?.total_count,
        insights: data.insights?.data?.map((d: any) => ({ name: d.name, value: d.values?.[0]?.value })),
      };
    } catch (e) {
      results['_direct_post'] = { exception: String(e).substring(0, 80) };
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
