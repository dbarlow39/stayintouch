// One-off cleanup: removes orphaned storage files and Dropbox folders for
// 7 closings that were already deleted from the closings table.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DROPBOX_APP_KEY = Deno.env.get("DROPBOX_APP_KEY")!;
const DROPBOX_APP_SECRET = Deno.env.get("DROPBOX_APP_SECRET")!;

const AGENT_ID = "579941cc-bf37-4a75-8030-450e06c49f44";

const STORAGE_PATHS = [
  "0c4b87b6-ff79-4ad7-8dd0-7174c0726271/1780412435042-13252_Ashley_Creek_Dr_-_Compiled_Paperwork.pdf",
  "0d6123e9-58c1-4f50-a6ca-8a96b5e20a42/1777313798867-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
  "163579c2-0866-4ed4-8959-378d45cc0f11/1780340973884-5196_Mantua_Dr_-_Compiled_Paperwork.pdf",
  "1f1e500c-3d14-41f7-a3ff-87a39c2c80ac/1777311401470-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
  "55d1dc13-9b11-42cd-a9cb-c917ce014023/1780340846810-2475_Parkwood_Ave_-_Compiled_Paperwork.pdf",
  "60fc05c0-7a23-4096-9e21-c4b7bd2019c0/1780412398704-5992_Weathered_Oak_Ct_-_Compiled_Paperwork.pdf",
  "6a54ed18-f485-4073-8983-84b0d2ceaa7f/1777311843336-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
  "72acf6bd-acff-4404-aa48-38aa4a43ab33/1780412408738-668_Founders_Ridge_Dr_-_Compiled_Paperwork.pdf",
  "766bcc1e-a718-4d82-a2ab-b779b42dc64f/1777308334460-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
  "84be4cb8-13ab-43a1-ae6e-c6d9b3f7514d/1777312363394-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
  "92ecd2e1-64b5-42f5-9450-dc063dd499b8/1777303936744-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
  "ce2b5794-f182-448b-ba4f-943032e1dd91/1780412403938-113_Blackstone_Ct_-_Compiled_Paperwork.pdf",
  "d8a24a41-2516-40f5-963e-d5f02bc33168/1780339363981-2475_Parkwood_Ave_-_Compiled_Paperwork.pdf",
  "d8a24a41-2516-40f5-963e-d5f02bc33168/1780339796234-2475_Parkwood_Ave_-_Compiled_Paperwork.pdf",
  "e95af34d-d9a8-4532-9d00-2015dc830122/1777312983787-6834_Cedar_Brook_Gln_-_Compiled_Paperwork.pdf",
];

const DROPBOX_FOLDERS = [
  "/Closed Deals/5196 Mantua Dr",
  "/Closed Deals/2475 Parkwood Ave",
  "/Closed Deals/13252 Ashley Creek Dr",
  "/Closed Deals/668 Founders Ridge Dr",
  "/Closed Deals/113 Blackstone Ct",
  "/Closed Deals/5992 Weathered Oak Ct",
  "/Closed Deals/6834 Cedar Brook Gln",
];

async function getDropboxToken(supabase: any): Promise<string> {
  const { data } = await supabase.from("dropbox_tokens").select("*").eq("agent_id", AGENT_ID).single();
  let token = data.access_token;
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
    token = rd.access_token;
    await supabase.from("dropbox_tokens").update({
      access_token: token,
      expires_at: new Date(Date.now() + (rd.expires_in || 14400) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("agent_id", AGENT_ID);
  }
  return token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const result: any = { storage: {}, dropbox: {} };

  // Storage
  const { data: removed, error: rmErr } = await admin.storage
    .from("closing-paperwork").remove(STORAGE_PATHS);
  result.storage.removed = removed?.length || 0;
  result.storage.error = rmErr?.message;

  // Dropbox
  try {
    const token = await getDropboxToken(admin);
    for (const folder of DROPBOX_FOLDERS) {
      const r = await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: folder }),
      });
      const txt = await r.text();
      if (r.ok || txt.includes("not_found")) {
        result.dropbox[folder] = r.ok ? "deleted" : "not_found";
      } else {
        result.dropbox[folder] = `error: ${r.status} ${txt.slice(0, 200)}`;
      }
    }
  } catch (e) {
    result.dropbox.error = e instanceof Error ? e.message : String(e);
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
