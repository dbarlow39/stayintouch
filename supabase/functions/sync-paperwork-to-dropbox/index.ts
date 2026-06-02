// Cloud-side sync: lists "Compiled Paperwork" Gmail messages, downloads PDFs,
// parses with parse-closing-paperwork, creates closing rows, AND uploads PDFs to
// Dropbox at /Closed Deals/<address>/<filename>.pdf.
//
// Dedup:
//   - App row dedup: skip if a closing with the same agent_id + normalized address
//     already exists. (Closings cannot be duplicated by this function.)
//   - Dropbox dedup: closings row tracks dropbox_upload_status + dropbox_file_path.
//     Dropbox upload uses mode:"add" so re-uploading is safe (returns conflict → treated as success).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY")!;
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET")!;
const DROPBOX_BASE = "/Closed Deals";

function normalizeAddr(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function safeFileName(name: string): string {
  let n = (name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!n.toLowerCase().endsWith(".pdf")) n += ".pdf";
  return n;
}

function safeFolderName(addr: string): string {
  return (addr || "Unknown").replace(/[<>:"/\\|?*]+/g, "_").trim();
}

async function getGmailAccessToken(supabase: any, agentId: string): Promise<string> {
  const { data, error } = await supabase
    .from("gmail_oauth_tokens").select("*").eq("agent_id", agentId).single();
  if (error || !data) throw new Error("Gmail not connected");
  let accessToken = data.access_token;
  if (new Date(data.token_expiry) < new Date()) {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const rd = await r.json();
    if (!r.ok) throw new Error("Gmail token refresh failed");
    accessToken = rd.access_token;
    await supabase.from("gmail_oauth_tokens").update({
      access_token: accessToken,
      token_expiry: new Date(Date.now() + rd.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_id", agentId);
  }
  return accessToken;
}

async function getDropboxAccessToken(supabase: any, agentId: string): Promise<string> {
  const { data, error } = await supabase
    .from("dropbox_tokens").select("*").eq("agent_id", agentId).single();
  if (error || !data) throw new Error("Dropbox not connected");
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
    if (!r.ok) throw new Error(`Dropbox token refresh failed: ${JSON.stringify(rd)}`);
    accessToken = rd.access_token;
    await supabase.from("dropbox_tokens").update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + (rd.expires_in || 14400) * 1000).toISOString(),
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
  const mime = payload.mimeType || "";
  const fn = payload.filename || "";
  const attId = payload.body?.attachmentId;
  if (attId && (mime === "application/pdf" || fn.toLowerCase().endsWith(".pdf"))) {
    out.push({ attachment_id: attId, filename: fn, size: payload.body?.size || 0 });
  }
  for (const p of payload.parts || []) findPdfParts(p, out);
  return out;
}

async function downloadAttachment(gmailToken: string, messageId: string, attachmentId: string): Promise<Uint8Array | null> {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${gmailToken}` } }
  );
  if (!r.ok) return null;
  const j = await r.json();
  const b64 = (j.data || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!b64) return null;
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function uploadToDropbox(
  dbxToken: string, dbxPath: string, bytes: Uint8Array,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const r = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${dbxToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: dbxPath,
        mode: "add",
        autorename: false,
        mute: true,
        strict_conflict: false,
      }),
    },
    body: bytes,
  });
  if (r.ok) {
    const j = await r.json();
    return { ok: true, path: j.path_lower || dbxPath };
  }
  const txt = await r.text();
  // Treat existing-file conflict as success (already uploaded)
  if (txt.includes("path/conflict")) {
    return { ok: true, path: dbxPath };
  }
  return { ok: false, error: `${r.status} ${txt.slice(0, 300)}` };
}

async function storageUpload(serviceClient: any, path: string, bytes: Uint8Array): Promise<boolean> {
  const { error } = await serviceClient.storage
    .from("closing-paperwork")
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  return !error;
}

async function signedUrl(serviceClient: any, path: string): Promise<string | null> {
  const { data, error } = await serviceClient.storage
    .from("closing-paperwork").createSignedUrl(path, 1800);
  if (error) return null;
  return data?.signedUrl || null;
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
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (cErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const agentId = claims.claims.sub as string;

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Resolve agent display name
    let agentName = "Unknown";
    {
      const { data: prof } = await serviceClient
        .from("profiles").select("full_name").eq("id", agentId).maybeSingle();
      if (prof?.full_name) agentName = prof.full_name;
    }

    const gmailToken = await getGmailAccessToken(serviceClient, agentId);
    const dbxToken = await getDropboxAccessToken(serviceClient, agentId);

    // Load existing closings for dedup (normalized address set)
    const { data: existingClosings } = await serviceClient
      .from("closings").select("property_address").eq("agent_id", agentId);
    const existingSet = new Set(
      (existingClosings || []).map((c: any) => normalizeAddr(c.property_address || ""))
    );

    // List Gmail messages
    const q = encodeURIComponent('subject:"Compiled Paperwork" newer_than:90d has:attachment');
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=200&q=${q}`,
      { headers: { Authorization: `Bearer ${gmailToken}` } },
    );
    if (!listRes.ok) {
      const t = await listRes.text();
      throw new Error(`Gmail list failed: ${listRes.status} ${t.slice(0, 200)}`);
    }
    const listData = await listRes.json();
    const messages = listData.messages || [];

    const summary: any[] = [];
    let createdCount = 0;
    let skippedCount = 0;
    let dbxFailCount = 0;

    for (const m of messages) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${gmailToken}` } }
        );
        if (!msgRes.ok) continue;
        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "";
        const address = parseAddress(subject);
        if (!address) continue;
        const norm = normalizeAddr(address);
        if (!norm) continue;
        if (existingSet.has(norm)) {
          skippedCount++;
          summary.push({ address, status: "skipped_exists" });
          continue;
        }
        const attachments = findPdfParts(msg.payload);
        if (attachments.length === 0) continue;

        // Download + upload to storage
        const folderId = crypto.randomUUID();
        const paperworkFiles: any[] = [];
        const signedUrls: string[] = [];
        const dropboxFolder = `${DROPBOX_BASE}/${safeFolderName(address)}`;
        let dbxOk = true;
        let firstDbxPath: string | null = null;

        for (const att of attachments) {
          const bytes = await downloadAttachment(gmailToken, m.id, att.attachment_id);
          if (!bytes) continue;
          const fname = safeFileName(att.filename);
          const storagePath = `${folderId}/${Date.now()}-${fname}`;
          const storedOk = await storageUpload(serviceClient, storagePath, bytes);
          if (!storedOk) continue;
          paperworkFiles.push({
            name: att.filename || fname,
            path: storagePath,
            size: bytes.length,
            uploaded_at: new Date().toISOString(),
            scan_status: "complete",
          });
          const su = await signedUrl(serviceClient, storagePath);
          if (su) signedUrls.push(su);

          // Upload to Dropbox
          const dbxPath = `${dropboxFolder}/${fname}`;
          const up = await uploadToDropbox(dbxToken, dbxPath, bytes);
          if (up.ok) {
            if (!firstDbxPath) firstDbxPath = up.path || dbxPath;
          } else {
            dbxOk = false;
            console.warn(`Dropbox upload failed for ${dbxPath}: ${up.error}`);
          }
        }

        if (paperworkFiles.length === 0) continue;

        // Parse PDFs with AI
        let extracted: any = {};
        if (signedUrls.length > 0) {
          try {
            const pr = await fetch(`${SUPABASE_URL}/functions/v1/parse-closing-paperwork`, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                apikey: SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ signed_urls: signedUrls, representation: "seller" }),
            });
            if (pr.ok) extracted = (await pr.json()).extracted || {};
          } catch (e) {
            console.warn("parse-closing-paperwork failed:", e);
          }
        }

        // Validate closing_date
        let closingDate = extracted.closing_date;
        if (!closingDate || !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
          closingDate = new Date().toISOString().slice(0, 10);
        }

        const row: any = {
          agent_id: agentId,
          agent_name: agentName,
          created_by: agentId,
          property_address: extracted.property_address || address,
          city: extracted.city || null,
          state: extracted.state || "OH",
          zip: extracted.zip || null,
          closing_date: closingDate,
          sale_price: extracted.sale_price || 0,
          paperwork_files: paperworkFiles,
          paperwork_status: "received",
          notes: `Auto-imported from Gmail '${subject}' on ${new Date().toISOString().slice(0, 10)}`,
          dropbox_upload_status: dbxOk ? "uploaded" : "failed",
          dropbox_file_path: firstDbxPath,
        };
        Object.keys(row).forEach((k) => row[k] === null && delete row[k]);

        const { error: insErr } = await serviceClient.from("closings").insert(row);
        if (insErr) {
          summary.push({ address, status: "closing_insert_failed", error: insErr.message });
          continue;
        }
        createdCount++;
        if (!dbxOk) dbxFailCount++;
        existingSet.add(norm);
        summary.push({
          address,
          status: dbxOk ? "created_and_uploaded" : "created_dbx_failed",
          file_count: paperworkFiles.length,
        });
      } catch (e) {
        console.error("Per-message error:", e);
        summary.push({ message_id: m.id, status: "error", error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: messages.length,
        created: createdCount,
        skipped: skippedCount,
        dropbox_failures: dbxFailCount,
        details: summary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("sync-paperwork-to-dropbox error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
