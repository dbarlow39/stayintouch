/**
 * Serves dynamic Open Graph meta tags for a specific listing.
 * Facebook's scraper hits this URL and gets proper title/image/description.
 * Real browsers get redirected to the actual listing page.
 *
 * Usage: GET /og-listing?id=<listing_id>
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url = new URL(req.url);
  const listingId = url.searchParams.get("id");

  if (!listingId) {
    return new Response("Missing id parameter", { status: 400 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const listingPageUrl = `https://listings.sellfor1percent.com/listing/${listingId}`;

  // Defaults
  let ogTitle = "Sellfor1Percent.com";
  let ogDescription = "Full Service Real Estate for just a 1% Commission";
  let ogImage = "https://listings.sellfor1percent.com/logo.jpg";

  try {
    const syncResp = await fetch(`${SUPABASE_URL}/functions/v1/flexmls-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: "single_listing",
        params: { listingId },
      }),
    });

    if (syncResp.ok) {
      const syncData = await syncResp.json();
      const listing = syncData?.data;

      if (listing && listing.address) {
        const fullAddress = [listing.address, listing.city, listing.state, listing.zip]
          .filter(Boolean)
          .join(", ");

        ogTitle = fullAddress;

        const parts: string[] = [];
        if (listing.price) parts.push(`$${Number(listing.price).toLocaleString("en-US")}`);
        if (listing.beds) parts.push(`${listing.beds} Beds`);
        if (listing.baths) parts.push(`${listing.baths} Baths`);
        if (listing.sqft) parts.push(`${Number(listing.sqft).toLocaleString()} sqft`);
        parts.push("Sellfor1Percent.com");

        ogDescription = parts.join(" | ");

        if (listing.photos?.length > 0) {
          ogImage = listing.photos[0];
        }
      }
    }
  } catch (err) {
    console.error("[og-listing] Error fetching listing:", err);
  }

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Build the edge function's own URL for og:url so Facebook doesn't follow to the SPA
  // Use the pretty listing URL for og:url so Facebook displays a clean domain
  const ogUrl = listingPageUrl;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(ogTitle)}</title>
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDescription)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:url" content="${esc(ogUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Sellfor1Percent.com" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDescription)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
</head>
<body>
   <p>Redirecting to <a href="${esc(listingPageUrl)}">${esc(ogTitle)}</a>...</p>
   <script>window.location.href = "${esc(listingPageUrl)}";</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
