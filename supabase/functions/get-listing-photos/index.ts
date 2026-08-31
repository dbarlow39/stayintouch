import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-access-key",
};

const BUCKET = "listing-photos";
const SIGNED_URL_TTL = 3600; // 1 hour

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const accessKey = Deno.env.get("LISTING_PHOTOS_ACCESS_KEY") ?? "";

  const url = new URL(req.url);
  let body: any = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const supplied =
    req.headers.get("x-access-key") ??
    url.searchParams.get("key") ??
    body.key ??
    "";

  let authorized = accessKey.length > 0 && supplied === accessKey;

  // Signed-in app users are allowed without the password.
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const userClient = createClient(supabaseUrl, anonKey);
      const { data } = await userClient.auth.getUser(token);
      if (data?.user) authorized = true;
    }
  }

  if (!authorized) return json({ error: "Forbidden" }, 403);

  const mls = (url.searchParams.get("mls") ?? body.mls ?? "").toString().trim();
  const address = (url.searchParams.get("address") ?? body.address ?? "").toString().trim();

  const supabase = createClient(supabaseUrl, serviceKey);

  let query = supabase
    .from("listing_photo_archive")
    .select("mls_number, address, photo_index, storage_path, archived_at")
    .order("mls_number", { ascending: true })
    .order("photo_index", { ascending: true })
    .limit(2000);

  if (mls) query = query.eq("mls_number", mls);
  else if (address) query = query.ilike("address", `%${address}%`);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const rows = data ?? [];
  const paths = rows.map((r: any) => r.storage_path);

  let signedMap: Record<string, string> = {};
  if (paths.length > 0) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (signErr) return json({ error: signErr.message }, 500);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedMap[s.path] = s.signedUrl;
    }
  }

  const photos = rows.map((r: any) => ({
    mls_number: r.mls_number,
    address: r.address,
    photo_index: r.photo_index,
    archived_at: r.archived_at,
    url: signedMap[r.storage_path] ?? null,
  }));

  return json({ success: true, count: photos.length, expires_in: SIGNED_URL_TTL, photos });
});
