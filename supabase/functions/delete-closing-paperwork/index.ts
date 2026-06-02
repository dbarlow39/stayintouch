// Delete a closing row + cascade-delete its Supabase storage files and Dropbox folder.
// Admin-only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY")!;
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET")!;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

async function getUserFromAuth(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id || null;
  } catch {
    return null;
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${userId}&role=eq.admin`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
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

async function deleteDropboxPath(token: string, path: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path }),
    });
    if (r.ok) return { ok: true };
    const txt = await r.text();
    // Treat "not_found" as success (already gone)
    if (txt.includes("path_lookup/not_found") || txt.includes("not_found")) {
      return { ok: true };
    }
    return { ok: false, error: `${r.status}: ${txt}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserFromAuth(req.headers.get("Authorization"));
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await isAdmin(userId))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { closing_id } = await req.json();
    if (!closing_id || typeof closing_id !== "string") {
      return new Response(JSON.stringify({ error: "closing_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch the closing row
    const { data: row, error: fetchErr } = await admin
      .from("closings")
      .select("id, agent_id, paperwork_files, dropbox_file_path")
      .eq("id", closing_id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!row) {
      return new Response(JSON.stringify({ error: "Closing not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result: any = { storage_deleted: 0, dropbox_deleted: false };

    // 2. Delete Supabase storage files
    const paths = Array.isArray(row.paperwork_files)
      ? (row.paperwork_files as any[]).map((f) => f?.path).filter(Boolean)
      : [];
    if (paths.length > 0) {
      const { error: rmErr } = await admin.storage.from("closing-paperwork").remove(paths);
      if (rmErr) {
        console.warn("Storage remove error:", rmErr);
        result.storage_error = rmErr.message;
      } else {
        result.storage_deleted = paths.length;
      }
    }

    // 3. Delete Dropbox folder (parent of first file path)
    if (row.dropbox_file_path) {
      const folder = row.dropbox_file_path.replace(/\/[^/]+$/, "");
      if (folder && folder !== row.dropbox_file_path) {
        try {
          const dbxToken = await getDropboxAccessToken(admin, row.agent_id);
          const dbxRes = await deleteDropboxPath(dbxToken, folder);
          if (dbxRes.ok) {
            result.dropbox_deleted = true;
            result.dropbox_folder = folder;
          } else {
            result.dropbox_error = dbxRes.error;
          }
        } catch (e) {
          result.dropbox_error = e instanceof Error ? e.message : String(e);
        }
      }
    }

    // 4. Delete the closing row
    const { error: delErr } = await admin.from("closings").delete().eq("id", closing_id);
    if (delErr) throw delErr;
    result.row_deleted = true;

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("delete-closing-paperwork error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
