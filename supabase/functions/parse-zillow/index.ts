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

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(JSON.stringify({ 
        error: 'Firecrawl API key not configured',
        views: null,
        saves: null,
        days: null 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching Zillow page via Firecrawl:', zillow_url);

    // Use Firecrawl to scrape the Zillow page
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: zillow_url,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 3000, // Wait for dynamic content to load
      }),
    });

    const firecrawlData = await response.json();

    if (!response.ok || !firecrawlData.success) {
      console.error('Firecrawl API error:', firecrawlData);
      return new Response(JSON.stringify({ 
        error: firecrawlData.error || `Firecrawl request failed with status ${response.status}`,
        views: null,
        saves: null,
        days: null 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the markdown content from Firecrawl response
    const markdown = firecrawlData.data?.markdown || firecrawlData.markdown || '';
    console.log('Received markdown length:', markdown.length);
    console.log('Markdown snippet (first 1000 chars):', markdown.substring(0, 1000));

    // Parse the stats from the markdown content
    let views: number | null = null;
    let saves: number | null = null;
    let days: number | null = null;

    // Pattern for days on Zillow - try multiple patterns
    const daysPatterns = [
      /(\d+)\s*days?\s*on\s*Zillow/i,
      /Time on Zillow[:\s]*(\d+)\s*days?/i,
      /on Zillow\s*(\d+)\s*days?/i,
    ];
    
    for (const pattern of daysPatterns) {
      const match = markdown.match(pattern);
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
      /(\d+(?:,\d+)?)\s*views?/i,
    ];
    
    for (const pattern of viewsPatterns) {
      const match = markdown.match(pattern);
      if (match) {
        views = parseInt(match[1].replace(/,/g, ''), 10);
        console.log('Found views with pattern:', pattern.toString(), '- Value:', views);
        break;
      }
    }

    // Pattern for saves - try multiple patterns
    const savesPatterns = [
      /(\d+(?:,\d+)?)\s*saves?/i,
      /saved\s*by\s*(\d+(?:,\d+)?)/i,
      /(\d+(?:,\d+)?)\s*people\s*saved/i,
    ];
    
    for (const pattern of savesPatterns) {
      const match = markdown.match(pattern);
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
