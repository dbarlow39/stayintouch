import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const s = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: refs } = await s.from("closings").select("paperwork_files");
  const keep = new Set<string>();
  for (const r of refs || []) {
    for (const f of (r.paperwork_files as any[]) || []) {
      if (f?.path) keep.add(String(f.path).split("/")[0]);
    }
  }

  const orphanFolders: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await s.storage
      .from("closing-paperwork").list("", { limit: 1000, offset });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    if (!data?.length) break;
    for (const item of data) {
      if (item.name && !keep.has(item.name)) orphanFolders.push(item.name);
    }
    if (data.length < 1000) break;
    offset += 1000;
  }

  const toDelete: string[] = [];
  for (const folder of orphanFolders) {
    const { data: files } = await s.storage
      .from("closing-paperwork").list(folder, { limit: 1000 });
    for (const f of files || []) toDelete.push(`${folder}/${f.name}`);
  }

  let deleted = 0;
  if (toDelete.length > 0) {
    const { data: del, error: dErr } = await s.storage
      .from("closing-paperwork").remove(toDelete);
    if (dErr) return new Response(JSON.stringify({ error: dErr.message, toDelete }), { status: 500, headers: corsHeaders });
    deleted = del?.length || 0;
  }

  return new Response(JSON.stringify({
    orphan_folders: orphanFolders.length,
    files_targeted: toDelete.length,
    deleted,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
