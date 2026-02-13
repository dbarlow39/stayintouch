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
    const { agent_id, post_id, daily_budget, duration_days, city, state } = await req.json();

    if (!agent_id || !post_id || !daily_budget || !duration_days) {
      throw new Error("agent_id, post_id, daily_budget, and duration_days are required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get stored Facebook tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("facebook_oauth_tokens")
      .select("*")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData) {
      throw new Error("Facebook not connected. Please connect your Facebook Page first.");
    }

    const { page_access_token, page_id } = tokenData;
    if (!page_access_token || !page_id) {
      throw new Error("Facebook Page not configured. Please reconnect.");
    }

    const AD_ACCOUNT_ID = "563726213662060";
    const apiBase = "https://graph.facebook.com/v21.0";

    // Step 1: Create Campaign with HOUSING special ad category
    console.log("[boost] Creating campaign...");
    const campaignResp = await fetch(`${apiBase}/act_${AD_ACCOUNT_ID}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Boost - ${post_id} - ${new Date().toISOString().slice(0, 10)}`,
        objective: "OUTCOME_AWARENESS",
        status: "PAUSED",
        special_ad_categories: ["HOUSING"],
        access_token: page_access_token,
      }),
    });
    const campaignData = await campaignResp.json();
    console.log("[boost] Campaign response:", JSON.stringify(campaignData));

    if (campaignData.error) {
      throw new Error(campaignData.error.message || "Failed to create campaign");
    }

    const campaignId = campaignData.id;

    // Step 2: Create Ad Set with location targeting (Housing limits targeting)
    console.log("[boost] Creating ad set...");
    const now = new Date();
    const endDate = new Date(now.getTime() + duration_days * 24 * 60 * 60 * 1000);

    // Build targeting - Housing only allows broad geo targeting
    const targeting: any = {
      geo_locations: {},
    };

    if (city && state) {
      // Use city-based targeting with radius
      targeting.geo_locations.cities = [{
        key: `${city}, ${state}`,
        name: city,
        region: state,
        radius: 25,
        distance_unit: "mile",
      }];
    } else if (state) {
      targeting.geo_locations.regions = [{
        name: state,
        country: "US",
      }];
    } else {
      // Default to US-wide
      targeting.geo_locations.countries = ["US"];
    }

    const adSetResp = await fetch(`${apiBase}/act_${AD_ACCOUNT_ID}/adsets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Boost AdSet - ${post_id}`,
        campaign_id: campaignId,
        daily_budget: Math.round(daily_budget * 100), // Facebook uses cents
        billing_event: "IMPRESSIONS",
        optimization_goal: "REACH",
        start_time: now.toISOString(),
        end_time: endDate.toISOString(),
        targeting,
        status: "PAUSED",
        access_token: page_access_token,
      }),
    });
    const adSetData = await adSetResp.json();
    console.log("[boost] Ad Set response:", JSON.stringify(adSetData));

    if (adSetData.error) {
      // Clean up campaign if ad set fails
      await fetch(`${apiBase}/${campaignId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: page_access_token }),
      });
      throw new Error(adSetData.error.message || "Failed to create ad set");
    }

    const adSetId = adSetData.id;

    // Step 3: Create Ad using the existing post
    console.log("[boost] Creating ad from post:", post_id);
    const adResp = await fetch(`${apiBase}/act_${AD_ACCOUNT_ID}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Boost Ad - ${post_id}`,
        adset_id: adSetId,
        creative: {
          object_story_id: `${page_id}_${post_id.split("_").pop()}`,
        },
        status: "PAUSED",
        access_token: page_access_token,
      }),
    });
    const adData = await adResp.json();
    console.log("[boost] Ad response:", JSON.stringify(adData));

    if (adData.error) {
      // Clean up
      await fetch(`${apiBase}/${adSetId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: page_access_token }),
      });
      await fetch(`${apiBase}/${campaignId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: page_access_token }),
      });
      throw new Error(adData.error.message || "Failed to create ad");
    }

    // Step 4: Activate everything
    console.log("[boost] Activating campaign...");
    await fetch(`${apiBase}/${campaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", access_token: page_access_token }),
    });
    await fetch(`${apiBase}/${adSetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", access_token: page_access_token }),
    });
    await fetch(`${apiBase}/${adData.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", access_token: page_access_token }),
    });

    return new Response(JSON.stringify({
      success: true,
      campaign_id: campaignId,
      adset_id: adSetId,
      ad_id: adData.id,
      daily_budget,
      duration_days,
      total_budget: daily_budget * duration_days,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[boost] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
