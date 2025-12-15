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
      console.log('Invalid or missing Zillow URL:', zillow_url);
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

    // Try multiple user agents in case one is blocked
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    ];

    let response: Response | null = null;
    let lastError: string = '';

    for (const userAgent of userAgents) {
      try {
        response = await fetch(zillow_url, {
          headers: {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
        });

        console.log(`Attempt with user agent succeeded. Status: ${response.status}`);
        
        if (response.ok) {
          break;
        } else {
          lastError = `HTTP ${response.status}`;
          console.log(`HTTP error ${response.status}, trying next user agent...`);
        }
      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError.message : 'Fetch failed';
        console.error('Fetch attempt failed:', lastError);
      }
    }

    if (!response || !response.ok) {
      console.error('All fetch attempts failed. Last error:', lastError);
      return new Response(JSON.stringify({ 
        error: `Failed to fetch Zillow page: ${lastError}`,
        views: null,
        saves: null,
        days: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = await response.text();
    console.log('Received HTML length:', html.length);
    
    // Log a snippet to help debug what we're getting
    console.log('HTML snippet (first 500 chars):', html.substring(0, 500));
    
    // Parse the stats from the HTML
    let views: number | null = null;
    let saves: number | null = null;
    let days: number | null = null;

    // Pattern for days on Zillow - try multiple patterns
    const daysPatterns = [
      /(\d+)\s*days?\s*on\s*Zillow/i,
      /Time on Zillow[:\s]*(\d+)\s*days?/i,
      /"daysOnZillow"[:\s]*(\d+)/i,
    ];
    
    for (const pattern of daysPatterns) {
      const match = html.match(pattern);
      if (match) {
        days = parseInt(match[1], 10);
        console.log('Found days with pattern:', pattern.toString(), '- Value:', days);
        break;
      }
    }

    // Pattern for views - try multiple patterns
    const viewsPatterns = [
      /(\d+(?:,\d+)?)\s*views?\s*(?:in|this)/i,
      /(\d+(?:,\d+)?)\s*total\s*views?/i,
      /"views"[:\s]*(\d+)/i,
      /(\d+(?:,\d+)?)\s*views?/i,
    ];
    
    for (const pattern of viewsPatterns) {
      const match = html.match(pattern);
      if (match) {
        views = parseInt(match[1].replace(/,/g, ''), 10);
        console.log('Found views with pattern:', pattern.toString(), '- Value:', views);
        break;
      }
    }

    // Pattern for saves - try multiple patterns
    const savesPatterns = [
      /(\d+(?:,\d+)?)\s*saves?/i,
      /"saves"[:\s]*(\d+)/i,
      /saved\s*by\s*(\d+(?:,\d+)?)/i,
    ];
    
    for (const pattern of savesPatterns) {
      const match = html.match(pattern);
      if (match) {
        saves = parseInt(match[1].replace(/,/g, ''), 10);
        console.log('Found saves with pattern:', pattern.toString(), '- Value:', saves);
        break;
      }
    }

    console.log('Final parsed Zillow stats:', { views, saves, days });

    // If we couldn't parse any stats, note it in the error
    const parseError = (views === null && saves === null && days === null) 
      ? 'Could not extract stats from page - Zillow may have changed their page structure'
      : null;

    return new Response(JSON.stringify({ 
      views, 
      saves, 
      days,
      error: parseError 
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
