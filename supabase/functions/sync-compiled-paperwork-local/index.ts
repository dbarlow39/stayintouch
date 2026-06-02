// Lists "Compiled Paperwork" emails with all PDF attachment metadata.
// Auth-required. Caller (local script) uses returned IDs to download via get-gmail-attachment.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function getAccessToken(supabase: any, agentId: string): Promise<string> {
  const { data: tokenData, error } = await supabase
    .from("gmail_oauth_tokens").select("*").eq("agent_id", agentId).single();
  if (error || !tokenData) throw new Error("Gmail not connected");

  let accessToken = tokenData.access_token;
  if (new Date(tokenData.token_expiry) < new Date()) {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const rd = await r.json();
    if (!r.ok) throw new Error("Failed to refresh Gmail token");
    accessToken = rd.access_token;
    await supabase.from("gmail_oauth_tokens").update({
      access_token: accessToken,
      token_expiry: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_id", agentId);
  }
  return accessToken;
}

function parseAddress(subject: string): string | null {
  const m = subject.match(/Compiled Paperwork\s+for\s+(.+)$/i);
  if (!m) return null;
  return m[1].trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
}

function findPdfParts(payload: any, out: any[] = []): any[] {
  if (!payload) return out;
  const filename = payload.filename || "";
  const mime = payload.mimeType || "";
  const attId = payload.body?.attachmentId;
  if (attId && (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf"))) {
    out.push({ attachment_id: attId, filename, size: payload.body?.size || 0 });
  }
  for (const p of payload.parts || []) findPdfParts(p, out);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const agentId = claims.claims.sub;

    const accessToken = await getAccessToken(supabase, agentId);

    const q = encodeURIComponent('subject:"Compiled Paperwork" newer_than:90d has:attachment');
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=200&q=${q}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) {
      const t = await listRes.text();
      return new Response(JSON.stringify({ error: "Gmail list failed", details: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const listData = await listRes.json();
    const messages = listData.messages || [];

    const results: any[] = [];
    for (const m of messages) {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!msgRes.ok) continue;
      const msg = await msgRes.json();
      const headers = msg.payload?.headers || [];
      const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "";
      const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "";
      const date = headers.find((h: any) => h.name.toLowerCase() === "date")?.value || "";
      const address = parseAddress(subject);
      if (!address) continue;
      const attachments = findPdfParts(msg.payload);
      if (attachments.length === 0) continue;
      results.push({ message_id: m.id, subject, from, date, address, attachments });
    }

    return new Response(JSON.stringify({ emails: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
