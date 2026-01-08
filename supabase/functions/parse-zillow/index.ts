import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', views: null, saves: null, days: null }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', views: null, saves: null, days: null }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    console.log("Scraping Zillow via Firecrawl:", zillow_url);

    // Use v1 endpoint with simple markdown format
    const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: zillow_url,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 5000,
      }),
    });

    const fcData = await fcRes.json();

    if (!fcRes.ok || fcData?.success === false) {
      console.error("Firecrawl scrape error:", { status: fcRes.status, fcData });
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

    // Extract markdown from response (handle nested data structure)
    const markdown: string = fcData?.data?.markdown ?? fcData?.markdown ?? "";
    console.log("Received markdown length:", markdown.length);
    console.log("Markdown snippet (first 2000 chars):", markdown.substring(0, 2000));

    let views: number | null = null;
    let saves: number | null = null;
    let days: number | null = null;

    // Firecrawl returns markdown like: **94 days**on Zillow|**822**views|**17**saves|
    // Match bold markdown format: **NUMBER days**on Zillow or **NUMBER**days on Zillow
    const daysPatterns = [
      /\*\*(\d+)\s*days?\*\*\s*on\s*Zillow/i,
      /\*\*(\d+)\*\*\s*days?\s*on\s*Zillow/i,
      /(\d+)\s*days?\s*on\s*Zillow/i,
    ];
    
    for (const pattern of daysPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        days = toInt(match[1]);
        console.log("Found days with pattern:", pattern.toString(), "- Value:", days);
        break;
      }
    }

    // Match bold markdown format: **NUMBER**views or **NUMBER** views
    const viewsPatterns = [
      /\*\*(\d+(?:,\d+)?)\*\*\s*views?/i,
      /(\d+(?:,\d+)?)\s*views?/i,
    ];
    
    for (const pattern of viewsPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        views = toInt(match[1]);
        console.log("Found views with pattern:", pattern.toString(), "- Value:", views);
        break;
      }
    }

    // Match bold markdown format: **NUMBER**saves or **NUMBER** saves
    const savesPatterns = [
      /\*\*(\d+(?:,\d+)?)\*\*\s*saves?/i,
      /(\d+(?:,\d+)?)\s*saves?/i,
    ];
    
    for (const pattern of savesPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        saves = toInt(match[1]);
        console.log("Found saves with pattern:", pattern.toString(), "- Value:", saves);
        break;
      }
    }

    console.log("Final parsed Zillow stats:", { views, saves, days });

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
