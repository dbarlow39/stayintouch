/**
 * Proxies an MLS listing photo into the ad-images storage bucket
 * so Facebook can access it via a stable, public URL.
 *
 * Returns { success, fb_image_url }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { listing } = await req.json();
    if (!listing) throw new Error("listing is required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let fbImageUrl = "";
    let igImageUrl = "";

    if (listing.photos?.length > 0) {
      const photoUrl = listing.photos[0];
      const resp = await fetch(photoUrl, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) throw new Error(`Photo fetch failed: ${resp.status}`);

      const blob = await resp.blob();
      const ext = (resp.headers.get("content-type") || "image/jpeg").includes("png") ? "png" : "jpg";
      const ts = Date.now();
      const id = listing.mlsNumber || listing.id || "unknown";
      const fbName = `auto-fb-${id}-${ts}.${ext}`;

      const { error } = await supabase.storage
        .from("ad-images")
        .upload(fbName, blob, {
          contentType: resp.headers.get("content-type") || "image/jpeg",
          upsert: true,
        });

      if (error) throw new Error(`Upload: ${error.message}`);

      fbImageUrl = supabase.storage.from("ad-images").getPublicUrl(fbName).data.publicUrl;
      // Use same image for IG for now
      igImageUrl = fbImageUrl;

      console.log(`[generate-ad-image] Uploaded: ${fbImageUrl}`);
    }

    return new Response(
      JSON.stringify({ success: true, fb_image_url: fbImageUrl, ig_image_url: igImageUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-ad-image] Error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
