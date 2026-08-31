import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "listing-photos";

function extFor(url: string, contentType: string | null): string {
  const m = url.split("?")[0].match(/\.(jpe?g|png|webp|gif)$/i);
  if (m) return m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Service role may archive anything (called internally by flexmls-sync).
  // Backfill mode (reads listings from our own cache) also accepts the anon key.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isService = token === serviceKey;
  const isBackfill = body?.backfill === true;
  if (!isService && !(isBackfill && anonKey && token === anonKey)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let listings: any[] = Array.isArray(body.listings) ? body.listings : [];

  if (isBackfill) {
    const limit = Number(body.limit) > 0 ? Number(body.limit) : 5;
    const { data: cache } = await supabase
      .from("listings_cache")
      .select("listings")
      .eq("id", "current")
      .single();
    const all: any[] = Array.isArray(cache?.listings) ? (cache!.listings as any[]) : [];
    // Page through the archive — PostgREST caps a single select at 1000 rows.
    const doneMls = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data: page } = await supabase
        .from("listing_photo_archive")
        .select("mls_number")
        .range(from, from + 999);
      (page ?? []).forEach((r: any) => doneMls.add(r.mls_number));
      if (!page || page.length < 1000) break;
    }

    listings = all
      .filter((l: any) => Array.isArray(l?.photos) && l.photos.length > 0)
      .filter((l: any) => !doneMls.has(String(l.mlsNumber || l.id)))
      .slice(0, limit);
  }

  if (listings.length === 0) {
    return new Response(JSON.stringify({ success: true, archived: 0, remaining: 0, note: "no listings" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  let archived = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const listing of listings) {
    const mls = String(listing?.mlsNumber || listing?.id || "").trim();
    const photos: string[] = Array.isArray(listing?.photos) ? listing.photos : [];
    if (!mls || photos.length === 0) continue;

    const address = [listing?.address, listing?.city, listing?.state, listing?.zip]
      .filter(Boolean)
      .join(", ");

    // Which indexes already exist for this listing?
    const { data: existing } = await supabase
      .from("listing_photo_archive")
      .select("photo_index")
      .eq("mls_number", mls);
    const done = new Set((existing ?? []).map((r: any) => r.photo_index));

    for (let i = 0; i < photos.length; i++) {
      if (done.has(i)) {
        skipped++;
        continue;
      }
      const url = photos[i];
      if (typeof url !== "string" || !url.startsWith("http")) continue;

      try {
        const res = await fetch(url);
        if (!res.ok) {
          errors.push(`${mls}#${i}: fetch ${res.status}`);
          continue;
        }
        const contentType = res.headers.get("content-type");
        const bytes = new Uint8Array(await res.arrayBuffer());
        const path = `${mls}/${String(i).padStart(3, "0")}.${extFor(url, contentType)}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, bytes, {
            contentType: contentType || "image/jpeg",
            upsert: true,
          });
        if (upErr) {
          errors.push(`${mls}#${i}: upload ${upErr.message}`);
          continue;
        }

        const { error: dbErr } = await supabase
          .from("listing_photo_archive")
          .upsert(
            {
              mls_number: mls,
              address,
              photo_index: i,
              storage_path: path,
              source_url: url,
            },
            { onConflict: "mls_number,photo_index" },
          );
        if (dbErr) {
          errors.push(`${mls}#${i}: db ${dbErr.message}`);
          continue;
        }
        archived++;
      } catch (e) {
        errors.push(`${mls}#${i}: ${(e as Error).message}`);
      }
    }
  }

  console.log(`[archive-listing-photos] archived=${archived} skipped=${skipped} errors=${errors.length}`);

  return new Response(
    JSON.stringify({ success: true, archived, skipped, errors: errors.slice(0, 20) }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
