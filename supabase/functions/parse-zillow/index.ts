import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type FirecrawlV2ScrapeResponse = {
  success?: boolean;
  error?: string;
  code?: string;
  data?: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    json?: unknown;
    metadata?: unknown;
  };
  // Some responses may not be nested (defensive)
  markdown?: string;
  html?: string;
  rawHtml?: string;
  json?: unknown;
  details?: unknown;
};

function pickJson(payload: FirecrawlV2ScrapeResponse): unknown {
  return payload?.data?.json ?? payload?.json ?? null;
}

function pickText(payload: FirecrawlV2ScrapeResponse): string {
  return payload?.data?.markdown ?? payload?.markdown ?? payload?.data?.html ?? payload?.html ?? "";
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const match = String(value).match(/[\d,]+/);
  if (!match) return null;
  const n = parseInt(match[0].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { zillow_url } = await req.json();

    if (!zillow_url || typeof zillow_url !== "string" || !zillow_url.includes("zillow.com")) {
      console.log("Invalid or missing Zillow URL:", zillow_url);
      return new Response(
        JSON.stringify({ error: "Invalid Zillow URL", views: null, saves: null, days: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Firecrawl API key not configured", views: null, saves: null, days: null }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Scraping Zillow via Firecrawl v2:", zillow_url);

    const fcRes = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: zillow_url,
        // v2 supports object formats; use LLM JSON extraction directly.
        formats: [
          {
            type: "json",
            prompt:
              "Extract Zillow listing engagement stats from the page. Return JSON with keys: views, saves, daysOnZillow. Use null if a value is not visible.",
            schema: {
              type: "object",
              properties: {
                views: { type: ["number", "null"] },
                saves: { type: ["number", "null"] },
                daysOnZillow: { type: ["number", "null"] },
              },
              required: [],
            },
          },
          "markdown",
        ],
        onlyMainContent: false,
        waitFor: 6000,
        maxAge: 0,
        proxy: "auto",
      }),
    });

    const fcData = (await fcRes.json()) as FirecrawlV2ScrapeResponse;

    if (!fcRes.ok || fcData?.success === false) {
      console.error("Firecrawl v2 scrape error:", { status: fcRes.status, fcData });
      return new Response(
        JSON.stringify({
          error: fcData?.error || `Firecrawl request failed with status ${fcRes.status}`,
          views: null,
          saves: null,
          days: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extracted = pickJson(fcData);
    const fallbackText = pickText(fcData);

    let views: number | null = null;
    let saves: number | null = null;
    let days: number | null = null;

    if (extracted && typeof extracted === "object") {
      const obj = extracted as Record<string, unknown>;
      views = toInt(obj.views);
      saves = toInt(obj.saves);
      days = toInt(obj.daysOnZillow ?? obj.days);
    }

    // Fallback: regex against markdown (just in case)
    if (views === null && saves === null && days === null && fallbackText) {
      console.log("Firecrawl JSON extraction empty; trying regex fallback.");

      const daysMatch = fallbackText.match(/(\d+)\s*days?\s*on\s*Zillow/i);
      if (daysMatch) days = toInt(daysMatch[1]);

      const viewsMatch = fallbackText.match(/(\d+(?:,\d+)?)\s*views?/i);
      if (viewsMatch) views = toInt(viewsMatch[1]);

      const savesMatch = fallbackText.match(/(\d+(?:,\d+)?)\s*saves?/i);
      if (savesMatch) saves = toInt(savesMatch[1]);

      console.log("Fallback snippet:", fallbackText.substring(0, 1400));
    }

    console.log("Parsed Zillow stats:", { views, saves, days });

    const parseError = views === null && saves === null && days === null
      ? "Could not extract stats from page"
      : null;

    return new Response(JSON.stringify({ views, saves, days, error: parseError }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing Zillow:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        views: null,
        saves: null,
        days: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
