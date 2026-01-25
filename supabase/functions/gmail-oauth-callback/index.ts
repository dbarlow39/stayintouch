import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains agent_id
    const error = url.searchParams.get("error");

    if (error) {
      console.error("OAuth error:", error);
      return new Response(
        `<html><body><h1>Gmail Connection Failed</h1><p>${error}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code || !state) {
      return new Response(
        `<html><body><h1>Missing Parameters</h1><p>Authorization code or state missing.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const agentId = state;
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error("Google OAuth credentials not configured");
    }

    // Exchange code for tokens
    const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-oauth-callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log("Token exchange response status:", tokenResponse.status);

    if (!tokenResponse.ok || tokenData.error) {
      console.error("Token exchange error:", tokenData);
      return new Response(
        `<html><body><h1>Token Exchange Failed</h1><p>${tokenData.error_description || tokenData.error}</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user's email address from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const userInfo = await userInfoResponse.json();
    const emailAddress = userInfo.email;

    console.log("Gmail connected for:", emailAddress);

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Store tokens in database
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { error: upsertError } = await supabase
      .from("gmail_oauth_tokens")
      .upsert({
        agent_id: agentId,
        access_token,
        refresh_token,
        token_expiry: tokenExpiry,
        email_address: emailAddress,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id" });

    if (upsertError) {
      console.error("Database error:", upsertError);
      throw upsertError;
    }

    // Return success page that closes itself
    return new Response(
      `<html>
        <head><style>body { font-family: system-ui; text-align: center; padding: 50px; }</style></head>
        <body>
          <h1>✅ Gmail Connected!</h1>
          <p>Successfully connected ${emailAddress}</p>
          <p>You can close this window.</p>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({ type: 'gmail-oauth-success', email: '${emailAddress}' }, '*');
              }
              window.close();
            }, 2000);
          </script>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );

  } catch (err) {
    console.error("Gmail OAuth callback error:", err);
    return new Response(
      `<html><body><h1>Error</h1><p>${err instanceof Error ? err.message : "Unknown error"}</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
