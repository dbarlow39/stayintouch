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
const DROPBOX_BASE = "/0 Sell for 1 Percent/Closed Deals";
const BACKFILL_TOTAL_CAP = 2500;

function normalizeAddr(s: string): string {
  let n = (s || "").toLowerCase();
  // Collapse directional abbreviations (N/S/E/W) with their long forms
  n = n.replace(/\b(n|north)\b/g, " ")
       .replace(/\b(s|south)\b/g, " ")
       .replace(/\b(e|east)\b/g, " ")
       .replace(/\b(w|west)\b/g, " ")
       .replace(/\b(ne|northeast)\b/g, " ")
       .replace(/\b(nw|northwest)\b/g, " ")
       .replace(/\b(se|southeast)\b/g, " ")
       .replace(/\b(sw|southwest)\b/g, " ");
  // Strip common street-type suffixes so "Ave"/"Avenue", "Dr"/"Drive" collapse to the same key
  n = n.replace(/\b(avenue|ave|drive|dr|street|st|road|rd|boulevard|blvd|court|ct|lane|ln|place|pl|way|circle|cir|terrace|ter|parkway|pkwy|highway|hwy|trail|trl|trace|square|sq|grove|grv|point|pt|ridge|hill|hl|view|vw|manor|mnr|row|loop|pass|run|crossing|xing)\b/g, "");
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

const STREET_SUFFIX_RE =
  /(Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Ln|Lane|Way|Blvd|Boulevard|Ct|Court|Pl|Place|Trl|Trace|Trail|Hwy|Highway|Cir|Circle|Ter|Terrace|Pkwy|Parkway|Sq|Square|Row|Loop|Pass|Run|Xing|Crossing|Ridge|Ridg|Grv|Grove|Pt|Point|Hl|Hill|Vw|View|Mnr|Manor)/i;
const ADDRESS_RE = new RegExp(
  String.raw`\b(\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.'\-]+(?:\s+[A-Za-z0-9.'\-]+){0,5}\s+` +
    STREET_SUFFIX_RE.source + String.raw`)\b`,
  "gi",
);

type AddrHit = { address: string; representation: "buyer" | "seller" | null };

function parseAddressesFromSubject(subject: string): AddrHit[] {
  if (!subject) return [];
  const s = subject.replace(/^\s*(Re:|Fwd?:)\s*/gi, "").trim();
  // Case A: "Compiled Paperwork for <addr>"
  const forMatch = s.match(/Compiled Paperwork\s+for\s+(.+)$/i);
  if (forMatch) {
    return [{ address: forMatch[1].trim().replace(/\s+/g, " "), representation: null }];
  }
  // Case B: multi-address like "183 W Case (buyer), 1910 rosemont (seller), 4826 Edge Grove (seller) Paperwork"
  const cleaned = s.replace(/\bPaperwork\b\s*$/i, "").trim();
  const parts = cleaned.split(/\s*,\s*|\s+and\s+/i);
  const out: AddrHit[] = [];
  for (const p of parts) {
    const m = p.match(/^(.+?)\s*(?:\((buyer|seller)\))?\s*$/i);
    if (!m) continue;
    const addr = m[1].trim();
    if (/\d/.test(addr) && addr.length >= 4) {
      out.push({ address: addr, representation: m[2] ? (m[2].toLowerCase() as any) : null });
    }
  }
  return out;
}

function extractAddressesFromText(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(ADDRESS_RE.source, "gi");
  while ((m = re.exec(text)) !== null) {
    out.add(m[1].replace(/\s+/g, " ").trim());
  }
  return Array.from(out);
}

function extractAddressesFromFilenames(files: { filename: string }[]): string[] {
  const out = new Set<string>();
  for (const f of files) {
    const name = (f.filename || "").replace(/\.pdf$/i, "").replace(/[_]+/g, " ");
    const re = new RegExp(ADDRESS_RE.source, "i");
    const m = name.match(re);
    if (m) out.add(m[1].replace(/\s+/g, " ").trim());
  }
  return Array.from(out);
}

function decodeB64Url(s: string): string {
  const b64 = (s || "").replace(/-/g, "+").replace(/_/g, "/");
  if (!b64) return "";
  try { return atob(b64 + "===".slice((b64.length + 3) % 4)); } catch { return ""; }
}

function getPlainTextBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeB64Url(payload.body.data);
  }
  for (const p of payload.parts || []) {
    const t = getPlainTextBody(p);
    if (t) return t;
  }
  return "";
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
    const limit: number = Math.max(1, Math.min(200, body?.limit ?? (mode === "backfill" ? 1 : 3)));
    const maxRuntimeMs: number = Math.max(10_000, Math.min(140_000, body?.max_runtime_ms ?? 30_000));

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const userAuthHeader = req.headers.get("Authorization");

    // For cron: agent_id passed in body. For manual: JWT.
    let agentId = await resolveAgentId(req, body);

    // One-off: re-run parser against an existing closing's paperwork_files and update checklist
    if (body?.action === "backfill_checklist" && typeof body?.closing_id === "string") {
      const { data: closing } = await serviceClient
        .from("closings").select("id, paperwork_files, representation").eq("id", body.closing_id).maybeSingle();
      if (!closing) {
        return new Response(JSON.stringify({ error: "closing not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const files: any[] = Array.isArray(closing.paperwork_files) ? closing.paperwork_files : [];
      const urls: string[] = [];
      for (const f of files) {
        if (!f?.path) continue;
        const u = await signedUrl(serviceClient, f.path);
        if (u) urls.push(u);
      }
      if (urls.length === 0) {
        return new Response(JSON.stringify({ error: "no signable files" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const pr = await fetch(`${SUPABASE_URL}/functions/v1/parse-closing-paperwork`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signed_urls: urls, representation: closing.representation || "seller" }),
      });
      if (!pr.ok) {
        const t = await pr.text().catch(() => "");
        return new Response(JSON.stringify({ error: "parse failed", detail: t }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const extracted = (await pr.json()).extracted || {};
      const checklist = {
        ...(extracted.checklist_detected || {}),
        built_before_1978: extracted.built_before_1978 === true,
      };
      const { error: updErr } = await serviceClient
        .from("closings").update({ paperwork_checklist: checklist }).eq("id", body.closing_id);
      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, checklist }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // Cron convenience: if no agent_id supplied, iterate all agents who have Dropbox connected.
    if (!agentId && mode === "incremental") {
      const { data: agents } = await serviceClient
        .from("dropbox_tokens").select("agent_id");
      const ids = (agents || []).map((a: any) => a.agent_id);
      const results: any[] = [];
      for (const id of ids) {
        try {
          const r = await runForAgent(serviceClient, id, "incremental", limit, maxRuntimeMs, null);
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

    const result = await runForAgent(serviceClient, agentId, mode, limit, maxRuntimeMs, userAuthHeader);
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
  userAuthHeader: string | null,
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

  // Load accounting agents for name matching against parsed PDF agent names
  const { data: agentsList } = await serviceClient
    .from("agents").select("full_name");
  const agentNames: string[] = (agentsList || []).map((a: any) => a.full_name).filter(Boolean);
  const normName = (s: string) => (s || "").toLowerCase().replace(/[^a-z]+/g, "");
  function matchAgent(name?: string | null): string | null {
    if (!name) return null;
    const target = normName(name);
    if (!target) return null;
    // Exact normalized match
    for (const n of agentNames) if (normName(n) === target) return n;
    // First+last token match (handles "Dave" vs "David", nicknames, middle names)
    const targetTokens = name.toLowerCase().split(/\s+/).filter(Boolean);
    const lastTarget = targetTokens[targetTokens.length - 1];
    for (const n of agentNames) {
      const nTokens = n.toLowerCase().split(/\s+/);
      const lastN = nTokens[nTokens.length - 1];
      if (lastTarget && lastN === lastTarget) {
        // last names match; require first-name initial match to disambiguate
        if (!targetTokens[0] || !nTokens[0] || targetTokens[0][0] === nTokens[0][0]) return n;
      }
    }
    return null;
  }

  // Existing closings map: norm addr -> { id, hasPaperwork }
  const { data: existingClosings } = await serviceClient
    .from("closings").select("id, property_address, paperwork_files").eq("agent_id", agentId);
  const { data: soldClients } = await serviceClient
    .from("clients").select("street_number, street_name")
    .eq("agent_id", agentId).eq("status", "S");
  const existingMap = new Map<string, { id: string | null; hasPaperwork: boolean }>();
  for (const c of (existingClosings || [])) {
    const n = normalizeAddr(c.property_address || "");
    if (!n) continue;
    const hasPaperwork = Array.isArray(c.paperwork_files) && c.paperwork_files.length > 0;
    existingMap.set(n, { id: c.id, hasPaperwork });
  }
  for (const c of (soldClients || [])) {
    const addr = `${c.street_number || ""} ${c.street_name || ""}`.trim();
    if (!addr) continue;
    const n = normalizeAddr(addr);
    if (n && !existingMap.has(n)) existingMap.set(n, { id: null, hasPaperwork: true });
  }

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

  // Gmail query — widened to also catch multi-address subjects ending in "Paperwork"
  const baseQuery = mode === "backfill"
    ? '(subject:"Compiled Paperwork" OR subject:Paperwork) has:attachment'
    : '(subject:"Compiled Paperwork" OR subject:Paperwork) newer_than:7d has:attachment';


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

    // Advance cursor BEFORE processing this page so a mid-page break (time/limit)
    // still resumes on the NEXT page on the next run, instead of re-scanning the
    // same head messages forever.
    pageToken = nextPage;

    for (const m of messages) {
      if (Date.now() - startedAt >= maxRuntimeMs) { outOfTime = true; break outer; }
      if (createdCount >= limit) { hitLimit = true; break outer; }
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
        const attachments = findPdfParts(msg.payload);
        if (attachments.length === 0) continue;

        // Discover ALL addresses in this email: subject -> body -> attachment filenames
        const hits: AddrHit[] = parseAddressesFromSubject(subject);
        if (hits.length === 0) {
          const body = getPlainTextBody(msg.payload);
          for (const a of extractAddressesFromText(body)) hits.push({ address: a, representation: null });
        }
        if (hits.length === 0) {
          for (const a of extractAddressesFromFilenames(attachments)) hits.push({ address: a, representation: null });
        }
        // Dedupe on normalized form
        const seenNorm = new Set<string>();
        const addressHits: AddrHit[] = [];
        for (const h of hits) {
          const n = normalizeAddr(h.address);
          if (!n || seenNorm.has(n)) continue;
          seenNorm.add(n);
          addressHits.push(h);
        }
        if (addressHits.length === 0) {
          summary.push({ message_id: m.id, subject, status: "no_address_found" });
          continue;
        }

        // Classify each address as create-new / update-existing / skip-complete
        const toCreate: AddrHit[] = [];
        const toUpdate: { hit: AddrHit; id: string }[] = [];
        for (const h of addressHits) {
          const n = normalizeAddr(h.address);
          const ex = existingMap.get(n);
          if (!ex) { toCreate.push(h); continue; }
          if (!ex.id) { // matched a Sold client, no closing row — skip
            summary.push({ address: h.address, status: "skipped_sold_client" });
            continue;
          }
          if (ex.hasPaperwork) {
            skippedCount++;
            summary.push({ address: h.address, status: "skipped_paperwork_already_attached" });
            continue;
          }
          toUpdate.push({ hit: h, id: ex.id });
        }
        if (toCreate.length === 0 && toUpdate.length === 0) continue;

        // Multi-address emails: we'll create bare closings below for any missing addresses so paperwork isn't lost.

        processedThisRun++;

        // Download + upload PDFs once per email (shared across all addresses)
        const folderId = crypto.randomUUID();
        const paperworkFiles: any[] = [];
        const signedUrls: string[] = [];
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

          const dbxPath = `${DROPBOX_BASE}/${fname}`;
          const up = await uploadToDropbox(dbxToken, dbxPath, bytes);
          if (up.ok) {
            if (!firstDbxPath) firstDbxPath = up.path || dbxPath;
          } else {
            dbxOk = false;
            console.warn(`Dropbox upload failed for ${dbxPath}: ${up.error}`);
          }
        }

        if (paperworkFiles.length === 0) continue;

        // Parse — run for both single- and multi-address emails so checklist boxes get auto-checked.
        // For multi-address emails, the detected checklist is applied to every address in the email
        // (approved trade-off: better to mark detected docs across all than leave everything unchecked).
        let extracted: any = {};
        let parseOk = false;
        if (signedUrls.length > 0) {
          try {
            const pr = await fetch(`${SUPABASE_URL}/functions/v1/parse-closing-paperwork`, {
              method: "POST",
              headers: {
                Authorization: userAuthHeader || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                apikey: SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ signed_urls: signedUrls, representation: "seller" }),
            });
            if (pr.ok) {
              extracted = (await pr.json()).extracted || {};
              parseOk = extracted && Object.keys(extracted).length > 0;
            } else {
              const errText = await pr.text().catch(() => "");
              console.warn(`parse-closing-paperwork ${pr.status}: ${errText}`);
            }
          } catch (e) {
            console.warn("parse-closing-paperwork failed:", e);
          }
        }
        const isMulti = addressHits.length > 1;

        // -------- UPDATE existing closings (attach paperwork to rows created from just a commission check) --------
        for (const upd of toUpdate) {
          const patch: any = {
            paperwork_files: paperworkFiles,
            paperwork_status: "received",
            dropbox_upload_status: dbxOk ? "uploaded" : "failed",
            dropbox_file_path: firstDbxPath,
            notes: `Paperwork auto-attached from Gmail '${subject}' on ${new Date().toISOString().slice(0, 10)}`,
          };
          // Apply detected checklist whenever we have one.
          // Single-address: also enrich empty sale_price/date/city/zip.
          if (parseOk) {
            const addrMatches = normalizeAddr(extracted.property_address || "") === normalizeAddr(upd.hit.address);
            if (addrMatches || isMulti) {
              patch.paperwork_checklist = {
                ...(extracted.checklist_detected || {}),
                built_before_1978: extracted.built_before_1978 === true,
              };
            }
            if (addrMatches && !isMulti) {
              const { data: cur } = await serviceClient
                .from("closings").select("sale_price, closing_date, city, zip").eq("id", upd.id).maybeSingle();
              if (cur) {
                if ((!cur.sale_price || Number(cur.sale_price) === 0) && Number(extracted.sale_price) > 0) {
                  patch.sale_price = Number(extracted.sale_price);
                }
                if (!cur.city && extracted.city) patch.city = extracted.city;
                if (!cur.zip && extracted.zip) patch.zip = extracted.zip;
                if (extracted.closing_date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.closing_date)) {
                  patch.closing_date = extracted.closing_date;
                }
              }
            }
          }
          const { error: updErr } = await serviceClient.from("closings").update(patch).eq("id", upd.id);
          if (updErr) {
            summary.push({ address: upd.hit.address, status: "closing_update_failed", error: updErr.message });
            continue;
          }
          existingMap.set(normalizeAddr(upd.hit.address), { id: upd.id, hasPaperwork: true });
          if (!dbxOk) dbxFailCount++;
          summary.push({
            address: upd.hit.address,
            status: dbxOk ? "paperwork_attached" : "paperwork_attached_dbx_failed",
            file_count: paperworkFiles.length,
          });
        }

        // -------- CREATE new closing(s) --------
        // Single-address: use parsed details when available.
        // Multi-address: create a bare closing per missing address so paperwork is attached and the row is visible for manual completion.
        for (const nc of toCreate) {
          const address = nc.address;
          const norm = normalizeAddr(address);
          const isSingle = addressHits.length === 1 && toCreate.length === 1;
          const useParsed = isSingle && parseOk && normalizeAddr(extracted.property_address || "") === norm;

          if (isSingle && !parseOk) {
            summary.push({ address, status: "parse_failed_will_retry" });
            continue;
          }

          let closingDate = useParsed ? extracted.closing_date : null;
          if (!closingDate || !/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
            closingDate = new Date().toISOString().slice(0, 10);
          }

          const salePrice = useParsed ? (Number(extracted.sale_price) || 0) : 0;
          const calculatedCheck = salePrice > 0 ? Math.max(salePrice * 0.01, 2250) + 499 : 0;
          const adminFee = 499;
          const totalCommission = Math.max(calculatedCheck - adminFee, 0);
          const companyPct = 40;
          const agentPct = 60;
          const companyShare = totalCommission * (companyPct / 100);
          const agentShare = totalCommission * (agentPct / 100);
          const caliberDetected = useParsed && (extracted.caliber_title_detected === true
            || /caliber/i.test(String(extracted.title_company || "")));

          const matchedAgentName = useParsed
            ? (matchAgent(extracted.listing_agent_name) || matchAgent(extracted.buyer_agent_name) || matchAgent(agentName) || agentName)
            : (matchAgent(agentName) || agentName);

          const rep = nc.representation || (useParsed ? "seller" : "seller");
          const row: any = {
            agent_id: agentId,
            agent_name: matchedAgentName,
            created_by: agentId,
            property_address: useParsed ? (extracted.property_address || address) : address,
            city: useParsed ? (extracted.city || null) : null,
            state: useParsed ? (extracted.state || "OH") : "OH",
            zip: useParsed ? (extracted.zip || null) : null,
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
            representation: rep,
            paperwork_files: paperworkFiles,
            paperwork_status: "received",
            paperwork_checklist: useParsed
              ? { ...(extracted.checklist_detected || {}), built_before_1978: extracted.built_before_1978 === true }
              : (parseOk && isMulti
                  ? { ...(extracted.checklist_detected || {}), built_before_1978: extracted.built_before_1978 === true }
                  : {}),
            notes: `Auto-imported from Gmail '${subject}' on ${new Date().toISOString().slice(0, 10)}${!useParsed ? ' (multi-address email — details need manual review)' : ''}`,
            dropbox_upload_status: dbxOk ? "uploaded" : "failed",
            dropbox_file_path: firstDbxPath,
          };
          Object.keys(row).forEach((k) => row[k] === null && delete row[k]);

          const finalNorm = normalizeAddr(row.property_address);
          if (finalNorm !== norm && existingMap.has(finalNorm)) {
            skippedCount++;
            summary.push({ address: row.property_address, status: "skipped_exists_after_parse" });
            continue;
          }
          const { error: insErr } = await serviceClient.from("closings").insert(row);
          if (insErr) {
            summary.push({ address, status: "closing_insert_failed", error: insErr.message });
          } else {
            createdCount++;
            if (!dbxOk) dbxFailCount++;
            existingMap.set(norm, { id: null, hasPaperwork: true });
            existingMap.set(finalNorm, { id: null, hasPaperwork: true });
            summary.push({
              address,
              status: useParsed ? (dbxOk ? "created_and_uploaded" : "created_dbx_failed") : (dbxOk ? "created_bare_multi_address" : "created_bare_multi_address_dbx_failed"),
              file_count: paperworkFiles.length,
            });
          }
        }
      } catch (e) {
        console.error("Per-message error:", e);
        summary.push({ message_id: m.id, status: "error", error: String(e) });
      }
    }


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
