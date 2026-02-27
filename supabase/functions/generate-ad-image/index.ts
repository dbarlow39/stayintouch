/**
 * Generates branded ad images for Facebook auto-posts.
 * Creates a 1200×630 branded overlay (red banner, price, specs, gradient)
 * matching the manual ad canvas renderer, using resvg-wasm for SVG→PNG.
 *
 * Also uploads the raw listing photo for Instagram use.
 *
 * Returns { success, fb_image_url, ig_image_url }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { render } from "https://deno.land/x/resvg_wasm/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const W = 1200;
const H = 630;

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) {
    const m = price / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2)}M`;
  }
  return "$" + price.toLocaleString("en-US");
}

/** Convert Uint8Array to base64 string (chunked to avoid call-stack overflow) */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildBrandedSvg(opts: {
  photoBase64: string;
  photoMime: string;
  bannerText: string;
  price: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  sqft: number;
  agentName: string;
  agentPhone: string;
  mlsNumber: string;
}): string {
  const {
    photoBase64, photoMime, bannerText, price, address, city, state, zip,
    beds, baths, sqft, agentName, agentPhone, mlsNumber,
  } = opts;

  const fullAddress = `${address}, ${city}, ${state} ${zip}`;
  const specsText = `${beds} Beds    ${baths} Baths    ${sqft.toLocaleString()} Sq Ft`;
  const priceText = formatPrice(price);
  const bannerH = 70;

  // Bottom layout positions (bottom-up, matching adCanvasRenderer)
  const bottomPad = 36;
  const agentBarH = 56;
  const agentBarY = H - 20 - agentBarH; // 554
  const specsY = agentBarY - 18;        // 536
  const addressY = specsY - 28;         // 508
  const priceY = addressY - 48;         // 460

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0.05"/>
      <stop offset="40%" stop-color="black" stop-opacity="0.10"/>
      <stop offset="70%" stop-color="black" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
    </linearGradient>
    <clipPath id="roundedBar">
      <rect x="${bottomPad}" y="${agentBarY}" width="${W - bottomPad * 2}" height="${agentBarH}" rx="8"/>
    </clipPath>
  </defs>

  <!-- Hero photo -->
  <image xlink:href="data:${photoMime};base64,${photoBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>

  <!-- Dark gradient overlay -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#overlay)"/>

  <!-- Red banner -->
  <rect x="0" y="0" width="${W}" height="${bannerH}" fill="#cc0000"/>
  <text x="${W / 2}" y="${bannerH / 2 + 2}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="36" font-weight="800" font-family="Inter, sans-serif" letter-spacing="5">${escXml(bannerText.toUpperCase())}</text>

  <!-- Price -->
  <text x="${bottomPad}" y="${priceY}" fill="white" font-size="69" font-weight="800" font-family="Inter, sans-serif">${escXml(priceText)}</text>

  <!-- Address -->
  <text x="${bottomPad}" y="${addressY}" fill="#e0e0e0" font-size="32" font-weight="600" font-family="Inter, sans-serif">${escXml(fullAddress)}</text>

  <!-- Specs -->
  <text x="${bottomPad}" y="${specsY}" fill="white" font-size="29" font-weight="600" font-family="Inter, sans-serif">${escXml(specsText)}</text>

  <!-- Agent bar background -->
  <rect x="${bottomPad}" y="${agentBarY}" width="${W - bottomPad * 2}" height="${agentBarH}" rx="8" fill="black" fill-opacity="0.5"/>

  <!-- Agent name -->
  <text x="${bottomPad + 14}" y="${agentBarY + agentBarH / 2 - 9}" dominant-baseline="central" fill="white" font-size="18" font-weight="700" font-family="Inter, sans-serif">${escXml(agentName || "Agent")}</text>

  <!-- Agent phone -->
  <text x="${bottomPad + 14}" y="${agentBarY + agentBarH / 2 + 11}" dominant-baseline="central" fill="#bbbbbb" font-size="15" font-family="Inter, sans-serif">${escXml(agentPhone)}</text>

  <!-- MLS number -->
  <text x="${W - bottomPad - 14}" y="${agentBarY + agentBarH / 2}" dominant-baseline="central" text-anchor="end" fill="#cccccc" font-size="15" font-family="Inter, sans-serif">MLS# ${escXml(mlsNumber)}</text>
</svg>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { listing, bannerText, agentPhone } = await req.json();
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

      const photoBlob = await resp.blob();
      const photoMime = resp.headers.get("content-type") || "image/jpeg";
      const ext = photoMime.includes("png") ? "png" : "jpg";
      const ts = Date.now();
      const id = listing.mlsNumber || listing.id || "unknown";

      // Upload raw photo for Instagram (unchanged)
      const igName = `auto-ig-${id}-${ts}.${ext}`;
      const { error: igUpErr } = await supabase.storage
        .from("ad-images")
        .upload(igName, photoBlob, { contentType: photoMime, upsert: true });

      if (!igUpErr) {
        igImageUrl = supabase.storage.from("ad-images").getPublicUrl(igName).data.publicUrl;
        console.log(`[generate-ad-image] IG raw photo: ${igImageUrl}`);
      }

      // Generate branded Facebook image via SVG → PNG
      try {
        const photoBytes = new Uint8Array(await photoBlob.arrayBuffer());
        const photoBase64 = uint8ToBase64(photoBytes);

        const svg = buildBrandedSvg({
          photoBase64,
          photoMime,
          bannerText: bannerText || "NEW LISTING",
          price: listing.price || 0,
          address: listing.address || "",
          city: listing.city || "",
          state: listing.state || "OH",
          zip: listing.zip || "",
          beds: listing.beds || 0,
          baths: listing.baths || 0,
          sqft: listing.totalStructureArea || listing.sqft || 0,
          agentName: listing.agent?.name || "Agent",
          agentPhone: agentPhone || "",
          mlsNumber: listing.mlsNumber || "",
        });

        console.log(`[generate-ad-image] SVG built, rendering to PNG...`);
        const pngData = await render(svg);
        console.log(`[generate-ad-image] PNG rendered, size: ${pngData.length} bytes`);

        const fbName = `auto-fb-${id}-${ts}.png`;
        const { error: fbUpErr } = await supabase.storage
          .from("ad-images")
          .upload(fbName, pngData, { contentType: "image/png", upsert: true });

        if (!fbUpErr) {
          fbImageUrl = supabase.storage.from("ad-images").getPublicUrl(fbName).data.publicUrl;
          console.log(`[generate-ad-image] Branded FB image: ${fbImageUrl}`);
        } else {
          console.error(`[generate-ad-image] FB upload failed: ${fbUpErr.message}`);
          // Fall back to raw photo
          fbImageUrl = igImageUrl;
        }
      } catch (renderErr) {
        console.error(`[generate-ad-image] SVG render failed, falling back to raw photo:`, renderErr);
        // Fall back to raw photo for FB
        if (!fbImageUrl) {
          const fbFallbackName = `auto-fb-${id}-${ts}.${ext}`;
          const { error } = await supabase.storage
            .from("ad-images")
            .upload(fbFallbackName, photoBlob, { contentType: photoMime, upsert: true });
          if (!error) {
            fbImageUrl = supabase.storage.from("ad-images").getPublicUrl(fbFallbackName).data.publicUrl;
          }
        }
      }
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
