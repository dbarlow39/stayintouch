// Hourly cron: re-attempts Dropbox uploads for closings with
// dropbox_upload_status IN ('pending','failed') that have paperwork_files in
// the closing-paperwork storage bucket. Uses service role; bypasses auth.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY")!;
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET")!;
const DROPBOX_BASE = "/0 Sell for 1 Percent/Closed Deals";

function safeFileName(name: string): string {
  let n = (name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
  return n;
}
function safeFolderName(addr: string): string {
  return (addr || "Unknown").replace(/[<>:"/\\|?*]+/g, "_").trim();
}

async function getDropboxAccessToken(supabase: any, agentId: string): Promise<string | null> {
  const { data } = await supabase
    .from("dropbox_tokens").select("*").eq("agent_id", agentId).maybeSingle();
  if (!data) return null;
  let accessToken = data.access_token;
  if (new Date(data.expires_at) < new Date(Date.now() + 60_000)) {
    const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: data.refresh_token,
        client_id: DROPBOX_APP_KEY,
        client_secret: DROPBOX_APP_SECRET,
      }),
    });
    const rd = await r.json();
    if (!r.ok) return null;
    accessToken = rd.access_token;
    await supabase.from("dropbox_tokens").update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + (rd.expires_in || 14400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_id", agentId);
  }
  return accessToken;
}

async function uploadToDropbox(token: string, path: string, bytes: Uint8Array) {
  const r = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path, mode: "add", autorename: false, mute: true, strict_conflict: false,
      }),
    },
    body: bytes,
  });
  if (r.ok) {
    const j = await r.json();
    return { ok: true, path: j.path_lower || path };
  }
  const txt = await r.text();
  if (txt.includes("path/conflict")) return { ok: true, path };
  return { ok: false, error: `${r.status} ${txt.slice(0, 300)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from("closings")
    .select("id, agent_id, property_address, paperwork_files, dropbox_upload_status")
    .in("dropbox_upload_status", ["pending", "failed"])
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dbxTokenCache: Record<string, string | null> = {};
  let okCount = 0, failCount = 0, skipCount = 0;

  for (const row of rows || []) {
    const files = (row.paperwork_files as any[]) || [];
    if (files.length === 0) { skipCount++; continue; }

    if (!(row.agent_id in dbxTokenCache)) {
      dbxTokenCache[row.agent_id] = await getDropboxAccessToken(supabase, row.agent_id);
    }
    const dbxToken = dbxTokenCache[row.agent_id];
    if (!dbxToken) { skipCount++; continue; }

    const folder = DROPBOX_BASE;
    let allOk = true;
    let firstPath: string | null = null;

    for (const f of files) {
      try {
        const { data: dl, error: dErr } = await supabase.storage
          .from("closing-paperwork").download(f.path);
        if (dErr || !dl) { allOk = false; continue; }
        const bytes = new Uint8Array(await dl.arrayBuffer());
        const fname = safeFileName(f.name || "document.pdf");
        const dbxPath = `${folder}/${fname}`;
        const up = await uploadToDropbox(dbxToken, dbxPath, bytes);
        if (!up.ok) { allOk = false; continue; }
        if (!firstPath) firstPath = up.path || dbxPath;
      } catch (e) {
        console.error(`Retry failed for closing ${row.id}:`, e);
        allOk = false;
      }
    }

    await supabase.from("closings").update({
      dropbox_upload_status: allOk ? "uploaded" : "failed",
      dropbox_file_path: firstPath || null,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    if (allOk) okCount++; else failCount++;
  }

  return new Response(
    JSON.stringify({ processed: rows?.length || 0, ok: okCount, failed: failCount, skipped: skipCount }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
