/**
 * Generates branded ad images for Facebook and Instagram auto-posts.
 * FB: 1200×630 branded overlay (red banner, price, specs, gradient)
 * IG: 1080×1080 branded overlay matching instagramAdRenderer layout
 * Uses resvg-wasm for SVG→PNG.
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

const FB_W = 1200;
const FB_H = 630;
const IG_W = 1080;
const IG_H = 1080;

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

function buildFacebookSvg(opts: {
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

  const W = FB_W;
  const H = FB_H;
  const fullAddress = `${address}, ${city}, ${state} ${zip}`;
  const specsText = `${beds} Beds    ${baths} Baths    ${sqft.toLocaleString()} Sq Ft`;
  const priceText = formatPrice(price);
  const bannerH = 70;

  const agentBarH = 56;
  const agentBarY = H - 20 - agentBarH;
  const specsY = agentBarY - 18;
  const addressY = specsY - 28;
  const priceY = addressY - 48;
  const bottomPad = 36;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="black" stop-opacity="0.05"/>
      <stop offset="40%" stop-color="black" stop-opacity="0.10"/>
      <stop offset="70%" stop-color="black" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <image xlink:href="data:${photoMime};base64,${photoBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#overlay)"/>
  <rect x="0" y="0" width="${W}" height="${bannerH}" fill="#cc0000"/>
  <text x="${W / 2}" y="${bannerH / 2 + 2}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="36" font-weight="800" font-family="Inter, sans-serif" letter-spacing="5">${escXml(bannerText.toUpperCase())}</text>
  <text x="${bottomPad}" y="${priceY}" fill="white" font-size="69" font-weight="800" font-family="Inter, sans-serif">${escXml(priceText)}</text>
  <text x="${bottomPad}" y="${addressY}" fill="#e0e0e0" font-size="32" font-weight="600" font-family="Inter, sans-serif">${escXml(fullAddress)}</text>
  <text x="${bottomPad}" y="${specsY}" fill="white" font-size="29" font-weight="600" font-family="Inter, sans-serif">${escXml(specsText)}</text>
  <rect x="${bottomPad}" y="${agentBarY}" width="${W - bottomPad * 2}" height="${agentBarH}" rx="8" fill="black" fill-opacity="0.5"/>
  <text x="${bottomPad + 14}" y="${agentBarY + agentBarH / 2 - 9}" dominant-baseline="central" fill="white" font-size="18" font-weight="700" font-family="Inter, sans-serif">${escXml(agentName || "Agent")}</text>
  <text x="${bottomPad + 14}" y="${agentBarY + agentBarH / 2 + 11}" dominant-baseline="central" fill="#bbbbbb" font-size="15" font-family="Inter, sans-serif">${escXml(agentPhone)}</text>
  <text x="${W - bottomPad - 14}" y="${agentBarY + agentBarH / 2}" dominant-baseline="central" text-anchor="end" fill="#cccccc" font-size="15" font-family="Inter, sans-serif">MLS# ${escXml(mlsNumber)}</text>
</svg>`;
}

/** Build a 1080×1080 branded Instagram SVG matching instagramAdRenderer layout */
function buildInstagramSvg(opts: {
  photoBase64: string;
  photoMime: string;
  bannerText: string;
  price: number;
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  agentName: string;
  agentPhone: string;
  mlsNumber: string;
}): string {
  const {
    photoBase64, photoMime, bannerText, price, address,
    beds, baths, sqft, agentName, agentPhone, mlsNumber,
  } = opts;

  const W = IG_W;
  const H = IG_H;
  const priceText = formatPrice(price);
  const specsLine = `${address.toUpperCase()}   ||   ${beds} BEDS   |   ${baths} BATHS   |   ${sqft.toLocaleString()} SQ FT`;

  // Layout positions matching instagramAdRenderer.ts
  const bannerH = 58;
  const bannerY = Math.round(H * 0.58);       // ~626
  const specBarH = 56;
  const specBarY = bannerY + bannerH + 10;     // ~694
  const infoY = specBarY + specBarH + 24;      // ~774
  const centerX = W / 2;

  // Gradient: bottom ~45% with fade
  const gradStart = Math.round(H * 0.50);

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="igOverlay" x1="0" y1="${gradStart - 80}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="black" stop-opacity="0"/>
      <stop offset="15%" stop-color="black" stop-opacity="0.3"/>
      <stop offset="40%" stop-color="black" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="black" stop-opacity="0.88"/>
    </linearGradient>
  </defs>

  <!-- Dark base -->
  <rect x="0" y="0" width="${W}" height="${H}" fill="#1a1a2e"/>

  <!-- Hero photo -->
  <image xlink:href="data:${photoMime};base64,${photoBase64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>

  <!-- Dark gradient overlay on bottom -->
  <rect x="0" y="${gradStart - 80}" width="${W}" height="${H - gradStart + 80}" fill="url(#igOverlay)"/>

  <!-- Red banner -->
  <rect x="0" y="${bannerY}" width="${W}" height="${bannerH}" fill="#cc0000" opacity="0"/>
  ${(() => {
    // Measure approx banner text width (rough: ~20px per char at size 34)
    const approxW = bannerText.toUpperCase().length * 20 + 60;
    return `<rect x="0" y="${bannerY}" width="${approxW}" height="${bannerH}" fill="#cc0000"/>`;
  })()}
  <text x="24" y="${bannerY + bannerH / 2}" dominant-baseline="central" text-anchor="start" fill="white" font-size="34" font-weight="800" font-family="Segoe UI, Arial, sans-serif" letter-spacing="3">${escXml(bannerText.toUpperCase())}</text>

  <!-- Specs bar border -->
  <rect x="30" y="${specBarY}" width="${W - 60}" height="${specBarH}" rx="0" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
  <text x="${centerX}" y="${specBarY + specBarH / 2}" dominant-baseline="central" text-anchor="middle" fill="white" font-size="21" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escXml(specsLine)}</text>

  <!-- Company name -->
  <text x="${centerX}" y="${infoY}" dominant-baseline="hanging" text-anchor="middle" fill="white" font-size="32" font-weight="700" font-family="Segoe UI, Arial, sans-serif">SELL FOR 1 PERCENT</text>

  <!-- Price -->
  <text x="${centerX}" y="${infoY + 40}" dominant-baseline="hanging" text-anchor="middle" fill="white" font-size="48" font-weight="700" font-family="Segoe UI, Arial, sans-serif">${escXml(priceText)}</text>

  <!-- Agent name -->
  <text x="${centerX}" y="${infoY + 100}" dominant-baseline="hanging" text-anchor="middle" fill="white" font-size="26" font-weight="600" font-family="Segoe UI, Arial, sans-serif">${escXml(agentName || "Agent")}</text>

  <!-- Phone -->
  <text x="${centerX}" y="${infoY + 134}" dominant-baseline="hanging" text-anchor="middle" fill="#dddddd" font-size="24" font-weight="400" font-family="Segoe UI, Arial, sans-serif">${escXml(agentPhone)}</text>

  <!-- MLS number -->
  <text x="${centerX}" y="${infoY + 168}" dominant-baseline="hanging" text-anchor="middle" fill="#999999" font-size="16" font-weight="400" font-family="Segoe UI, Arial, sans-serif">MLS# ${escXml(mlsNumber)}</text>
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

      const photoBytes = new Uint8Array(await photoBlob.arrayBuffer());
      const photoBase64 = uint8ToBase64(photoBytes);

      const commonOpts = {
        photoBase64,
        photoMime,
        bannerText: bannerText || "NEW LISTING",
        price: listing.price || 0,
        address: listing.address || "",
        beds: listing.beds || 0,
        baths: listing.baths || 0,
        sqft: listing.totalStructureArea || listing.sqft || 0,
        agentName: listing.agent?.name || "Agent",
        agentPhone: agentPhone || "",
        mlsNumber: listing.mlsNumber || "",
      };

      // Generate branded Facebook image (1200×630)
      try {
        const fbSvg = buildFacebookSvg({
          ...commonOpts,
          city: listing.city || "",
          state: listing.state || "OH",
          zip: listing.zip || "",
        });

        console.log(`[generate-ad-image] FB SVG built, rendering to PNG...`);
        const fbPngData = await render(fbSvg);
        console.log(`[generate-ad-image] FB PNG rendered, size: ${fbPngData.length} bytes`);

        const fbName = `auto-fb-${id}-${ts}.png`;
        const { error: fbUpErr } = await supabase.storage
          .from("ad-images")
          .upload(fbName, fbPngData, { contentType: "image/png", upsert: true });

        if (!fbUpErr) {
          fbImageUrl = supabase.storage.from("ad-images").getPublicUrl(fbName).data.publicUrl;
          console.log(`[generate-ad-image] Branded FB image: ${fbImageUrl}`);
        } else {
          console.error(`[generate-ad-image] FB upload failed: ${fbUpErr.message}`);
        }
      } catch (fbRenderErr) {
        console.error(`[generate-ad-image] FB SVG render failed, falling back to raw photo:`, fbRenderErr);
        const fbFallbackName = `auto-fb-${id}-${ts}.${ext}`;
        const { error } = await supabase.storage
          .from("ad-images")
          .upload(fbFallbackName, photoBlob, { contentType: photoMime, upsert: true });
        if (!error) {
          fbImageUrl = supabase.storage.from("ad-images").getPublicUrl(fbFallbackName).data.publicUrl;
        }
      }

      // Generate branded Instagram image (1080×1080)
      try {
        const igSvg = buildInstagramSvg(commonOpts);

        console.log(`[generate-ad-image] IG SVG built, rendering to PNG...`);
        const igPngData = await render(igSvg);
        console.log(`[generate-ad-image] IG PNG rendered, size: ${igPngData.length} bytes`);

        const igName = `auto-ig-${id}-${ts}.png`;
        const { error: igUpErr } = await supabase.storage
          .from("ad-images")
          .upload(igName, igPngData, { contentType: "image/png", upsert: true });

        if (!igUpErr) {
          igImageUrl = supabase.storage.from("ad-images").getPublicUrl(igName).data.publicUrl;
          console.log(`[generate-ad-image] Branded IG image: ${igImageUrl}`);
        } else {
          console.error(`[generate-ad-image] IG upload failed: ${igUpErr.message}`);
        }
      } catch (igRenderErr) {
        console.error(`[generate-ad-image] IG SVG render failed, falling back to raw photo:`, igRenderErr);
        // Fall back to raw photo for IG
        const igFallbackName = `auto-ig-${id}-${ts}.${ext}`;
        const { error } = await supabase.storage
          .from("ad-images")
          .upload(igFallbackName, photoBlob, { contentType: photoMime, upsert: true });
        if (!error) {
          igImageUrl = supabase.storage.from("ad-images").getPublicUrl(igFallbackName).data.publicUrl;
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
