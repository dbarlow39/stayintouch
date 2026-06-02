// Cloud-side sync: lists "Compiled Paperwork" Gmail messages, downloads PDFs,
// parses with parse-closing-paperwork, creates closing rows, AND uploads PDFs to
// Dropbox at /Closed Deals/<address>/<filename>.pdf.
//
// Modes:
//   - "backfill" (manual button): walks Gmail page-by-page via dropbox_sync_cursor,
//     capped at 2500 messages total (BACKFILL_TOTAL_CAP). Processes up to `limit`
//     messages per invocation (default 8) or until max_runtime_ms (default 120000).
//   - "incremental" (default; cron 7am/7pm): no cursor; Gmail query restricted to
//     newer_than:7d; limit default 100; intended to catch new emails.

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
const BACKFILL_TOTAL_CAP = 2500;

function normalizeAddr(s: string): string {
  let n = (s || "").toLowerCase();
  // Strip common street-type suffixes so "Ave"/"Avenue", "Dr"/"Drive" collapse to the same key
  n = n.replace(/\b(avenue|ave|drive|dr|street|st|road|rd|boulevard|blvd|court|ct|lane|ln|place|pl|way|circle|cir|terrace|ter|parkway|pkwy|highway|hwy|trail|trl|square|sq)\b/g, "");
  return n.replace(/[^a-z0-9]+/g, "");
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

// Resolve agent_id from request: prefer JWT in Authorization header (manual button),
// else accept body.agent_id (cron with service-role key).
async function resolveAgentId(req: Request, body: any): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claims?.claims?.sub) return claims.claims.sub as string;
  }
  if (typeof body?.agent_id === "string") return body.agent_id;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const mode: "backfill" | "incremental" = body?.mode === "backfill" ? "backfill" : "incremental";
    const limit: number = Math.max(1, Math.min(200, body?.limit ?? (mode === "backfill" ? 8 : 100)));
    const maxRuntimeMs: number = Math.max(10_000, Math.min(140_000, body?.max_runtime_ms ?? 120_000));

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // For cron: agent_id passed in body. For manual: JWT.
    let agentId = await resolveAgentId(req, body);

    // Cron convenience: if no agent_id supplied, iterate all agents who have Dropbox connected.
    if (!agentId && mode === "incremental") {
      const { data: agents } = await serviceClient
        .from("dropbox_tokens").select("agent_id");
      const ids = (agents || []).map((a: any) => a.agent_id);
      const results: any[] = [];
      for (const id of ids) {
        try {
          const r = await runForAgent(serviceClient, id, "incremental", limit, maxRuntimeMs);
          results.push({ agent_id: id, ...r });
        } catch (e) {
          results.push({ agent_id: id, error: String(e) });
        }
      }
      return new Response(JSON.stringify({ ok: true, mode, agents: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!agentId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await runForAgent(serviceClient, agentId, mode, limit, maxRuntimeMs);
    return new Response(JSON.stringify({ ok: true, mode, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-paperwork-to-dropbox error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function runForAgent(
  serviceClient: any,
  agentId: string,
  mode: "backfill" | "incremental",
  limit: number,
  maxRuntimeMs: number,
) {
  const startedAt = Date.now();

  // Agent display name
  let agentName = "Unknown";
  {
    const { data: prof } = await serviceClient
      .from("profiles").select("full_name").eq("id", agentId).maybeSingle();
    if (prof?.full_name) agentName = prof.full_name;
  }

  const gmailToken = await getGmailAccessToken(serviceClient, agentId);
  const dbxToken = await getDropboxAccessToken(serviceClient, agentId);

  // Dedup set
  const { data: existingClosings } = await serviceClient
    .from("closings").select("property_address").eq("agent_id", agentId);
  const existingSet = new Set(
    (existingClosings || []).map((c: any) => normalizeAddr(c.property_address || ""))
  );

  // Cursor (backfill mode only)
  let cursor: any = null;
  if (mode === "backfill") {
    const { data } = await serviceClient
      .from("dropbox_sync_cursor").select("*").eq("agent_id", agentId).maybeSingle();
    cursor = data || { agent_id: agentId, next_page_token: null, messages_scanned: 0, backfill_complete: false };
    if (cursor.backfill_complete || cursor.messages_scanned >= BACKFILL_TOTAL_CAP) {
      return {
        processed: 0, scanned_total: cursor.messages_scanned,
        remaining: false, backfill_complete: true, details: [],
      };
    }
  }

  // Gmail query
  const baseQuery = mode === "backfill"
    ? 'subject:"Compiled Paperwork" has:attachment'
    : 'subject:"Compiled Paperwork" newer_than:7d has:attachment';

  const summary: any[] = [];
  let createdCount = 0;
  let skippedCount = 0;
  let dbxFailCount = 0;
  let processedThisRun = 0;
  let scannedThisRun = 0;
  let pageToken: string | null = mode === "backfill" ? (cursor?.next_page_token || null) : null;
  let outOfTime = false;
  let hitLimit = false;
  let exhausted = false;

  outer: while (true) {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("maxResults", String(mode === "backfill" ? 50 : 100));
    url.searchParams.set("q", baseQuery);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const listRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${gmailToken}` },
    });
    if (!listRes.ok) {
      const t = await listRes.text();
      throw new Error(`Gmail list failed: ${listRes.status} ${t.slice(0, 200)}`);
    }
    const listData = await listRes.json();
    const messages = listData.messages || [];
    const nextPage: string | null = listData.nextPageToken || null;

    if (messages.length === 0) {
      exhausted = !nextPage;
      pageToken = nextPage;
      if (!nextPage) break;
      continue;
    }

    for (const m of messages) {
      if (Date.now() - startedAt >= maxRuntimeMs) { outOfTime = true; break outer; }
      if (processedThisRun >= limit) { hitLimit = true; break outer; }
      if (mode === "backfill" && (cursor.messages_scanned + scannedThisRun) >= BACKFILL_TOTAL_CAP) {
        exhausted = true; break outer;
      }

      scannedThisRun++;

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

        processedThisRun++;

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

        let extracted: any = {};
        if (signedUrls.length > 0) {
          try {
            const pr = await fetch(`${SUPABASE_URL}/functions/v1/parse-closing-paperwork`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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

        let closingDate = extracted.closing_date;
        if (!closingDate || !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
          closingDate = new Date().toISOString().slice(0, 10);
        }

        const salePrice = Number(extracted.sale_price) || 0;
        const calculatedCheck = salePrice > 0 ? Math.max(salePrice * 0.01, 2250) + 499 : 0;
        const adminFee = 499;
        const totalCommission = Math.max(calculatedCheck - adminFee, 0);
        const companyPct = 40;
        const agentPct = 60;
        const companyShare = totalCommission * (companyPct / 100);
        const agentShare = totalCommission * (agentPct / 100);
        const caliberDetected = extracted.caliber_title_detected === true
          || /caliber/i.test(String(extracted.title_company || ""));

        const row: any = {
          agent_id: agentId,
          agent_name: agentName,
          created_by: agentId,
          property_address: extracted.property_address || address,
          city: extracted.city || null,
          state: extracted.state || "OH",
          zip: extracted.zip || null,
          closing_date: closingDate,
          sale_price: salePrice,
          total_commission: totalCommission,
          admin_fee: adminFee,
          company_split_pct: companyPct,
          agent_split_pct: agentPct,
          company_share: companyShare,
          agent_share: agentShare,
          caliber_title_bonus: caliberDetected,
          caliber_title_amount: caliberDetected ? 150 : 0,
          representation: "seller",
          paperwork_files: paperworkFiles,
          paperwork_status: "received",
          paperwork_checklist: {
            ...(extracted.checklist_detected || {}),
            built_before_1978: extracted.built_before_1978 === true,
          },
          notes: `Auto-imported from Gmail '${subject}' on ${new Date().toISOString().slice(0, 10)}`,
          dropbox_upload_status: dbxOk ? "uploaded" : "failed",
          dropbox_file_path: firstDbxPath,
        };
        Object.keys(row).forEach((k) => row[k] === null && delete row[k]);


        // Second-pass dedup: parsed address may normalize differently than subject address
        const finalNorm = normalizeAddr(row.property_address);
        if (finalNorm !== norm && existingSet.has(finalNorm)) {
          skippedCount++;
          summary.push({ address: row.property_address, status: "skipped_exists_after_parse" });
          continue;
        }

        const { error: insErr } = await serviceClient.from("closings").insert(row);
        if (insErr) {
          summary.push({ address, status: "closing_insert_failed", error: insErr.message });
          continue;
        }
        createdCount++;
        if (!dbxOk) dbxFailCount++;
        existingSet.add(norm);
        existingSet.add(finalNorm);
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

    pageToken = nextPage;
    if (!nextPage) { exhausted = true; break; }
  }

  // Persist cursor for backfill
  if (mode === "backfill") {
    const newScanned = (cursor.messages_scanned || 0) + scannedThisRun;
    const done = exhausted || newScanned >= BACKFILL_TOTAL_CAP;
    await serviceClient.from("dropbox_sync_cursor").upsert({
      agent_id: agentId,
      next_page_token: done ? null : pageToken,
      messages_scanned: newScanned,
      backfill_complete: done,
      updated_at: new Date().toISOString(),
    });
    return {
      processed: processedThisRun,
      created: createdCount,
      skipped: skippedCount,
      dropbox_failures: dbxFailCount,
      scanned_this_run: scannedThisRun,
      scanned_total: newScanned,
      total_cap: BACKFILL_TOTAL_CAP,
      remaining: !done && (outOfTime || hitLimit || !!pageToken),
      backfill_complete: done,
      details: summary,
    };
  }

  return {
    processed: processedThisRun,
    created: createdCount,
    skipped: skippedCount,
    dropbox_failures: dbxFailCount,
    scanned_this_run: scannedThisRun,
    remaining: outOfTime || hitLimit,
    details: summary,
  };
}
