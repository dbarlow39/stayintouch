import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_VERSION = "v25.0";

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
      .select("page_access_token, page_id, access_token, ad_account_id")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData?.page_access_token) {
      throw new Error("Facebook not connected or page token missing");
    }

    const pageToken = tokenData.page_access_token;
    const pageId = tokenData.page_id;
    const userToken = tokenData.access_token;
    const debugInfo: string[] = [];

    const fetchJson = async (url: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(url, { signal: controller.signal });
        return await resp.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    // Step 1: Get basic post data from published_posts
    let postData: any = {};
    if (pageId) {
      const feedUrl = `https://graph.facebook.com/${API_VERSION}/${pageId}/published_posts?fields=id,created_time,message,full_picture,shares&limit=100&access_token=${pageToken}`;
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

    // Step 2: Get post insights - only use metrics that are still valid after Nov 2025 deprecation
    const metrics: Record<string, any> = {};

    const metricGroups = [
      ['post_clicks_by_type'],
      ['post_reactions_by_type_total', 'post_activity_by_action_type'],
    ];

    const groupResults = await Promise.allSettled(metricGroups.map(async (group) => {
      const url = `https://graph.facebook.com/${API_VERSION}/${post_id}/insights?metric=${group.join(',')}&access_token=${pageToken}`;
      const data = await fetchJson(url);
      if (data.data?.length > 0) {
        for (const item of data.data) {
          metrics[item.name] = item.values?.[0]?.value;
        }
        return { ok: true, count: data.data.length, group: group.join(',') };
      } else if (data.error) {
        return { ok: false, error: data.error.message?.substring(0, 80), group: group.join(',') };
      }
      return { ok: true, count: 0, group: group.join(',') };
    }));

    for (const r of groupResults) {
      if (r.status === 'fulfilled') {
        const v = r.value;
        debugInfo.push(v.ok ? `Insights(${v.group}): ${v.count} metrics` : `Insights(${v.group}): ${v.error}`);
      } else {
        debugInfo.push(`Insights exception: ${String(r.reason).substring(0, 60)}`);
      }
    }

    // Step 3: Get ad insights via Ads API - use EQUAL operator and try multiple approaches
    // Include use_unified_attribution_setting=true to match Ads Manager numbers
    let adInsights: any = null;
    let foundAdId: string | null = null;
    let foundAdToken: string | null = null;
    const AD_ACCOUNT_ID = tokenData.ad_account_id || "563726213662060";
    const adInsightsFields = "impressions,reach,clicks,spend,cpc,cpm,actions,cost_per_action_type";
    const attrParam = "&use_account_attribution_setting=true&action_attribution_windows=[%221d_click%22,%221d_view%22]";

    // Approach A: Search ads by effective_object_story_id with EQUAL operator
    for (const [tokenLabel, token] of [["user", userToken], ["page", pageToken]]) {
      if (adInsights) break;
      try {
        const filterJson = JSON.stringify([{
          field: "effective_object_story_id",
          operator: "EQUAL",
          value: post_id
        }]);
        const adsUrl = `https://graph.facebook.com/${API_VERSION}/act_${AD_ACCOUNT_ID}/ads?fields=id,creative{effective_object_story_id},insights.fields(${adInsightsFields})${attrParam}&filtering=${encodeURIComponent(filterJson)}&access_token=${token}`;
        const adsData = await fetchJson(adsUrl);
        if (!adsData.error && adsData.data?.length > 0 && adsData.data[0].insights?.data?.[0]) {
          adInsights = adsData.data[0].insights.data[0];
          foundAdId = adsData.data[0].id;
          foundAdToken = token;
          debugInfo.push(`Ad insights found via ads filter (${tokenLabel} token)`);
        } else if (adsData.error) {
          debugInfo.push(`Ads filter(${tokenLabel}): ${adsData.error.message?.substring(0, 60)}`);
        } else {
          debugInfo.push(`Ads filter(${tokenLabel}): no matching ads found`);
        }
      } catch (_e) { /* non-fatal */ }
    }

    // Approach B: If no ad found via filter, scan recent ads
    if (!adInsights) {
      for (const [tokenLabel, token] of [["user", userToken], ["page", pageToken]]) {
        if (adInsights) break;
        try {
          const recentAdsUrl = `https://graph.facebook.com/${API_VERSION}/act_${AD_ACCOUNT_ID}/ads?fields=id,creative{effective_object_story_id}&limit=100&access_token=${token}`;
          const recentAds = await fetchJson(recentAdsUrl);
          if (!recentAds.error && recentAds.data) {
            const matchingAd = recentAds.data.find((ad: any) => 
              ad.creative?.effective_object_story_id === post_id
            );
            if (matchingAd) {
              const adInsightsUrl = `https://graph.facebook.com/${API_VERSION}/${matchingAd.id}/insights?fields=${adInsightsFields}${attrParam}&access_token=${token}`;
              const insightsResp = await fetchJson(adInsightsUrl);
              if (!insightsResp.error && insightsResp.data?.[0]) {
                adInsights = insightsResp.data[0];
                foundAdId = matchingAd.id;
                foundAdToken = token;
                debugInfo.push(`Ad insights found via ad scan (${tokenLabel}, ad ${matchingAd.id})`);
              } else {
                debugInfo.push(`Ad scan(${tokenLabel}): found ad ${matchingAd.id} but no insights`);
              }
            } else {
              debugInfo.push(`Ad scan(${tokenLabel}): ${recentAds.data.length} ads, no match for ${post_id}`);
            }
          } else if (recentAds.error) {
            debugInfo.push(`Ad scan(${tokenLabel}): ${recentAds.error.message?.substring(0, 60)}`);
          }
        } catch (_e) { /* non-fatal */ }
      }
    }

    // Approach C: Try promoted_posts edge on the post itself
    if (!adInsights) {
      try {
        const promoUrl = `https://graph.facebook.com/${API_VERSION}/${post_id}?fields=promotion_status,insights.metric(post_impressions,post_impressions_unique,post_engaged_users).period(lifetime)&access_token=${pageToken}`;
        const promoData = await fetchJson(promoUrl);
        if (!promoData.error && promoData.insights?.data) {
          const promoMetrics: Record<string, number> = {};
          for (const item of promoData.insights.data) {
            promoMetrics[item.name] = item.values?.[0]?.value || 0;
          }
          if (promoMetrics.post_impressions || promoMetrics.post_impressions_unique) {
            metrics._promo_impressions = promoMetrics.post_impressions || 0;
            metrics._promo_reach = promoMetrics.post_impressions_unique || 0;
            metrics._promo_engaged = promoMetrics.post_engaged_users || 0;
            debugInfo.push(`Promo insights: imp=${promoMetrics.post_impressions}, reach=${promoMetrics.post_impressions_unique}`);
          }
        } else if (promoData.error) {
          debugInfo.push(`Promo: ${promoData.error.message?.substring(0, 60)}`);
        }
      } catch (_e) { /* non-fatal */ }
    }

    console.log(`[fb-insights] Debug:`, JSON.stringify(debugInfo));

    // Extract reactions
    const reactionsObj = metrics.post_reactions_by_type_total || {};
    const totalReactions = Object.values(reactionsObj).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);

    // Extract activity
    const activityObj = metrics.post_activity_by_action_type || {};
    const comments = activityObj.comment || 0;
    const shares = postData.shares?.count || activityObj.share || 0;

    // Extract click types
    const clicksByType = metrics.post_clicks_by_type || {};

    // Calculate total engagements from organic metrics
    const totalClicks = Object.values(clicksByType).reduce((sum: number, v: any) => sum + (typeof v === 'number' ? v : 0), 0);
    const organicEngagements = totalReactions + comments + shares + (totalClicks > 0 ? totalClicks : 0);

    // Determine impressions and reach from best available source
    const promoImpressions = metrics._promo_impressions || 0;
    const promoReach = metrics._promo_reach || 0;
    const promoEngaged = metrics._promo_engaged || 0;

    // Parse ad actions
    let adActions: any[] = [];
    let adCostPerAction: any[] = [];
    let adEngagements = 0;
    if (adInsights) {
      adActions = adInsights.actions || [];
      adCostPerAction = adInsights.cost_per_action_type || [];
      const engagementAction = adActions.find((a: any) => a.action_type === 'post_engagement');
      if (engagementAction) {
        adEngagements = parseInt(engagementAction.value || "0");
      }
    }

    const finalEngagements = adInsights ? (adEngagements || organicEngagements) : (organicEngagements || promoEngaged);

    // Step 4: Fetch audience demographics with use_unified_attribution_setting
    let audienceData: any = null;
    if (foundAdId) {
      const tokensToTry = foundAdToken
        ? [[foundAdToken === userToken ? "user" : "page", foundAdToken], ...([["user", userToken], ["page", pageToken]] as const).filter(([,t]) => t !== foundAdToken)]
        : [["user", userToken], ["page", pageToken]];
      for (const [tokenLabel, token] of tokensToTry) {
        if (audienceData) break;
        try {
          const demoUrl = `https://graph.facebook.com/${API_VERSION}/${foundAdId}/insights?fields=reach,impressions&breakdowns=age,gender${attrParam}&access_token=${token}`;
          const demoData = await fetchJson(demoUrl);
          if (!demoData.error && demoData.data?.length > 0) {
            audienceData = demoData.data;
            debugInfo.push(`Audience demographics found (${tokenLabel}, ${demoData.data.length} rows)`);
          } else if (demoData.error) {
            debugInfo.push(`Audience(${tokenLabel}): ${demoData.error.message?.substring(0, 60)}`);
          }
        } catch (_e) { /* non-fatal */ }
      }
    }

    const result = {
      post_id,
      created_time: postData.created_time || null,
      message: postData.message || null,
      full_picture: postData.full_picture || null,
      likes: totalReactions,
      comments,
      shares,
      engagements: finalEngagements,
      impressions: adInsights ? parseInt(adInsights.impressions || "0") : promoImpressions,
      reach: adInsights ? parseInt(adInsights.reach || "0") : promoReach,
      clicks: adInsights ? parseInt(adInsights.clicks || "0") : totalClicks,
      click_types: Object.keys(clicksByType).length > 0 ? clicksByType : null,
      activity: activityObj,
      reactions: reactionsObj,
      engaged_users: promoEngaged,
      ad_insights: adInsights ? {
        impressions: parseInt(adInsights.impressions || "0"),
        reach: parseInt(adInsights.reach || "0"),
        clicks: parseInt(adInsights.clicks || "0"),
        spend: parseFloat(adInsights.spend || "0"),
        cpc: parseFloat(adInsights.cpc || "0"),
        cpm: parseFloat(adInsights.cpm || "0"),
        actions: adActions,
        cost_per_action: adCostPerAction,
      } : null,
      audience: audienceData,
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
