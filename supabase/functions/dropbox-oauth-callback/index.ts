import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthErr = url.searchParams.get("error");

    if (oauthErr) {
      return new Response(
        `<html><body><h1>Dropbox Connection Failed</h1><p>${oauthErr}</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }
    if (!code || !state) {
      return new Response(`<html><body><h1>Missing parameters</h1></body></html>`, {
        headers: { "Content-Type": "text/html" },
      });
    }

    const agentId = state;
    const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY")!;
    const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const redirectUri = `${SUPABASE_URL}/functions/v1/dropbox-oauth-callback`;

    // Exchange code for tokens
    const tokRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: DROPBOX_APP_KEY,
        client_secret: DROPBOX_APP_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    const tok = await tokRes.json();
    if (!tokRes.ok || tok.error) {
      console.error("Dropbox token exchange failed:", tok);
      return new Response(
        `<html><body><h1>Token Exchange Failed</h1><p>${tok.error_description || tok.error || tokRes.status}</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const { access_token, refresh_token, expires_in } = tok;
    const expiresAt = new Date(Date.now() + (expires_in || 14400) * 1000).toISOString();

    // Get account email
    let accountEmail = "";
    try {
      const acc = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (acc.ok) {
        const ad = await acc.json();
        accountEmail = ad?.email || "";
      }
    } catch (e) {
      console.warn("Could not fetch account email:", e);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: upsertErr } = await supabase
      .from("dropbox_tokens")
      .upsert(
        {
          agent_id: agentId,
          access_token,
          refresh_token,
          expires_at: expiresAt,
          account_email: accountEmail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "agent_id" }
      );

    if (upsertErr) {
      console.error("DB upsert error:", upsertErr);
      throw upsertErr;
    }

    return new Response(
      `<html>
        <head><style>body{font-family:system-ui;text-align:center;padding:50px}</style></head>
        <body>
          <h1>✅ Dropbox Connected!</h1>
          <p>${accountEmail || "Account linked"}</p>
          <p>You can close this window.</p>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({ type: 'dropbox-oauth-success', email: '${accountEmail}' }, '*');
              }
              window.close();
            }, 1500);
          </script>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    console.error("Dropbox OAuth callback error:", err);
    return new Response(
      `<html><body><h1>Error</h1><p>${err instanceof Error ? err.message : "Unknown"}</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
