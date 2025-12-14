import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { zillow_url } = await req.json();
    
    if (!zillow_url || !zillow_url.includes('zillow.com')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid Zillow URL',
        views: null,
        saves: null,
        days: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching Zillow page:', zillow_url);

    // Fetch the Zillow page
    const response = await fetch(zillow_url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch Zillow page:', response.status);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch Zillow page',
        views: null,
        saves: null,
        days: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    
    // Parse the stats from the HTML
    // Look for patterns like "X days on Zillow", "X views", "X saves"
    let views: number | null = null;
    let saves: number | null = null;
    let days: number | null = null;

    // Pattern for days on Zillow
    const daysMatch = html.match(/(\d+)\s*days?\s*on\s*Zillow/i);
    if (daysMatch) {
      days = parseInt(daysMatch[1], 10);
    }

    // Pattern for views - look for various formats
    const viewsMatch = html.match(/(\d+(?:,\d+)?)\s*views?/i);
    if (viewsMatch) {
      views = parseInt(viewsMatch[1].replace(/,/g, ''), 10);
    }

    // Pattern for saves
    const savesMatch = html.match(/(\d+(?:,\d+)?)\s*saves?/i);
    if (savesMatch) {
      saves = parseInt(savesMatch[1].replace(/,/g, ''), 10);
    }

    console.log('Parsed Zillow stats:', { views, saves, days });

    return new Response(JSON.stringify({ 
      views, 
      saves, 
      days,
      error: null 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error parsing Zillow:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      views: null,
      saves: null,
      days: null 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
