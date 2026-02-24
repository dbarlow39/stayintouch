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

  const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID")?.trim();
  const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET")?.trim();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const DEFAULT_APP_URL = "https://stayintouch.lovable.app";

  // Helper to decode state parameter which contains agent_id and app_origin
  const decodeState = (stateParam: string | null): { agent_id: string | null; app_origin: string } => {
    if (!stateParam) return { agent_id: null, app_origin: DEFAULT_APP_URL };
    try {
      const decoded = JSON.parse(atob(decodeURIComponent(stateParam)));
      return { agent_id: decoded.agent_id || null, app_origin: decoded.app_origin || DEFAULT_APP_URL };
    } catch {
      // Legacy: state was just the agent_id string
      return { agent_id: stateParam, app_origin: DEFAULT_APP_URL };
    }
  };

  // Handle GET redirect from Facebook
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      console.log("[FB Callback] GET request received, full URL:", url.toString());
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      
      const { agent_id, app_origin: APP_URL } = decodeState(stateParam);

      if (error) {
        return Response.redirect(`${APP_URL}/dashboard?fb_error=${encodeURIComponent(error)}`, 302);
      }

      if (!code || !agent_id) {
        return Response.redirect(`${APP_URL}/dashboard?fb_error=missing_params`, 302);
      }

      if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
        return Response.redirect(`${APP_URL}/dashboard?fb_error=not_configured`, 302);
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;
      console.log("[FB Callback] redirectUri for token exchange:", redirectUri);
      console.log("[FB Callback] agent_id:", agent_id, "code length:", code?.length);

      // Exchange code for user access token
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;
      console.log("[FB Callback] Exchanging code for token...");
      const tokenResp = await fetch(tokenUrl);
      const tokenText = await tokenResp.text();
      console.log("[FB Callback] Token response status:", tokenResp.status, "body:", tokenText.substring(0, 500));
      
      let tokenData;
      try { tokenData = JSON.parse(tokenText); } catch { 
        console.error("[FB Callback] Failed to parse token response");
        return Response.redirect(`${APP_URL}/dashboard?fb_error=token_parse_failed`, 302);
      }

      if (tokenData.error) {
        console.error("[FB Callback] Token exchange error:", JSON.stringify(tokenData.error));
        return Response.redirect(`${APP_URL}/dashboard?fb_error=${encodeURIComponent(tokenData.error.message || "token_exchange_failed")}`, 302);
      }

      const userAccessToken = tokenData.access_token;
      console.log("[FB Callback] Got user access token, length:", userAccessToken?.length);

      // Get long-lived token
      const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${userAccessToken}`;
      const longLivedResp = await fetch(longLivedUrl);
      const longLivedData = await longLivedResp.json();
      console.log("[FB Callback] Long-lived token response:", longLivedData.error ? JSON.stringify(longLivedData.error) : "success");
      const longLivedToken = longLivedData.access_token || userAccessToken;

      // Get user's pages
      const pagesResp = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`);
      const pagesData = await pagesResp.json();
      console.log("[FB Callback] Pages response:", JSON.stringify(pagesData).substring(0, 500));

      const page = pagesData.data?.[0] || null;
      console.log("[FB Callback] Using page:", page?.name || "NO PAGE FOUND", page?.id || "N/A");

      // Fetch ad account ID
      let adAccountId = null;
      try {
        const adAccountsResp = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${longLivedToken}`);
        const adAccountsData = await adAccountsResp.json();
        if (adAccountsData.data && adAccountsData.data.length > 0) {
          const activeAccount = adAccountsData.data.find((a: any) => a.account_status === 1) || adAccountsData.data[0];
          adAccountId = activeAccount.id.replace('act_', '');
          console.log("[FB Callback] Found ad account:", adAccountId, activeAccount.name);
        }
      } catch (e) {
        console.log("[FB Callback] Could not fetch ad accounts:", e);
      }

      // Fetch Instagram Business Account ID linked to the page
      let instagramAccountId = null;
      if (page) {
        try {
          const igResp = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
          const igData = await igResp.json();
          if (igData.instagram_business_account?.id) {
            instagramAccountId = igData.instagram_business_account.id;
            console.log("[FB Callback] Found Instagram Business Account:", instagramAccountId);
          } else {
            console.log("[FB Callback] No Instagram Business Account linked to page");
          }
        } catch (e) {
          console.log("[FB Callback] Could not fetch Instagram account:", e);
        }
      }

      // Store in database - save token even without a page
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

      const upsertData: Record<string, any> = {
        agent_id,
        access_token: longLivedToken,
        updated_at: new Date().toISOString(),
        ad_account_id: adAccountId,
        instagram_account_id: instagramAccountId,
      };
      if (page) {
        upsertData.page_id = page.id;
        upsertData.page_name = page.name;
        upsertData.page_access_token = page.access_token;
      }

      const { error: upsertError } = await supabase
        .from("facebook_oauth_tokens")
        .upsert(upsertData, { onConflict: "agent_id" });

      if (upsertError) {
        console.error("[FB Callback] Database error:", JSON.stringify(upsertError));
        return Response.redirect(`${APP_URL}/dashboard?fb_error=db_error`, 302);
      }

      console.log("[FB Callback] SUCCESS - token stored for agent:", agent_id);
      const redirectParam = page 
        ? `fb_connected=${encodeURIComponent(page.name)}`
        : `fb_connected=Facebook&fb_no_pages=1`;
      return Response.redirect(`${APP_URL}/dashboard?${redirectParam}`, 302);

    } catch (err) {
      console.error("Facebook OAuth callback error:", err);
      return Response.redirect(`${APP_URL}/dashboard?fb_error=unknown`, 302);
    }
  }

  // Legacy POST handler
  try {
    const { code, agent_id } = await req.json();

    if (!code || !agent_id) {
      throw new Error("code and agent_id are required");
    }

    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
      throw new Error("Facebook OAuth credentials not configured");
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;

    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${FACEBOOK_APP_SECRET}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message || "Token exchange failed");
    }

    const userAccessToken = tokenData.access_token;
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${FACEBOOK_APP_ID}&client_secret=${FACEBOOK_APP_SECRET}&fb_exchange_token=${userAccessToken}`;
    const longLivedResp = await fetch(longLivedUrl);
    const longLivedData = await longLivedResp.json();
    const longLivedToken = longLivedData.access_token || userAccessToken;

    const pagesResp = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedToken}`);
    const pagesData = await pagesResp.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error("No Facebook Pages found.");
    }

    const page = pagesData.data[0];
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch ad account ID for legacy handler
    let adAccountId = null;
    try {
      const adAccountsResp = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&access_token=${longLivedToken}`);
      const adAccountsData = await adAccountsResp.json();
      if (adAccountsData.data && adAccountsData.data.length > 0) {
        const activeAccount = adAccountsData.data.find((a: any) => a.account_status === 1) || adAccountsData.data[0];
        adAccountId = activeAccount.id.replace('act_', '');
      }
    } catch (_e) { /* non-fatal */ }

    // Fetch Instagram Business Account ID for legacy handler
    let instagramAccountId = null;
    try {
      const igResp = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
      const igData = await igResp.json();
      if (igData.instagram_business_account?.id) {
        instagramAccountId = igData.instagram_business_account.id;
      }
    } catch (_e) { /* non-fatal */ }

    await supabase.from("facebook_oauth_tokens").upsert({
      agent_id,
      access_token: longLivedToken,
      page_id: page.id,
      page_name: page.name,
      page_access_token: page.access_token,
      ad_account_id: adAccountId,
      instagram_account_id: instagramAccountId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "agent_id" });

    return new Response(JSON.stringify({ success: true, page_name: page.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Facebook OAuth callback error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
