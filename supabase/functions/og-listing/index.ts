/**
 * Serves dynamic Open Graph meta tags for a specific listing.
 * Facebook's scraper (facebookexternalhit) gets HTML with OG tags.
 * Real browsers get a 302 redirect to the actual listing page.
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

  const listingPageUrl = `https://listings.sellfor1percent.com/listing/${listingId}`;

  // Detect if this is a bot/crawler (Facebook, Twitter, etc.)
  const ua = (req.headers.get("user-agent") || "").toLowerCase();
  const isBot = ua.includes("facebookexternalhit") ||
    ua.includes("facebot") ||
    ua.includes("twitterbot") ||
    ua.includes("linkedinbot") ||
    ua.includes("whatsapp") ||
    ua.includes("telegram") ||
    ua.includes("slackbot") ||
    ua.includes("googlebot") ||
    ua.includes("bingbot");

  // Real browsers get an immediate 302 redirect
  if (!isBot) {
    return new Response(null, {
      status: 302,
      headers: { Location: listingPageUrl },
    });
  }

  // Bots get HTML with OG meta tags
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
        ogTitle = [listing.address, listing.city, listing.state, listing.zip]
          .filter(Boolean)
          .join(", ");

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

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(ogTitle)}</title>
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(ogDescription)}" />
  <meta property="og:image" content="${esc(ogImage)}" />
  <meta property="og:url" content="${esc(listingPageUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Sellfor1Percent.com" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(ogDescription)}" />
  <meta name="twitter:image" content="${esc(ogImage)}" />
</head>
<body>
  <p><a href="${esc(listingPageUrl)}">${esc(ogTitle)}</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});
