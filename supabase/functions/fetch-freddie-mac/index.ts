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
    console.log('Fetching Freddie Mac PMMS data...');
    
    // Fetch the Freddie Mac Primary Mortgage Market Survey page
    const pmmsUrl = 'https://www.freddiemac.com/pmms';
    const response = await fetch(pmmsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Freddie Mac page: ${response.status}`);
    }
    
    const html = await response.text();
    console.log('Fetched Freddie Mac page, extracting content...');
    
    // Extract the news release content - look for the weekly update section
    const newsMatch = html.match(/<div[^>]*class="[^"]*pmms-news[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const quoteMatch = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i);
    const paragraphs = html.match(/<p[^>]*class="[^"]*pmms[^"]*"[^>]*>([\s\S]*?)<\/p>/gi);
    
    // Extract any text content we can find
    let extractedContent = '';
    
    if (newsMatch) {
      extractedContent += newsMatch[1].replace(/<[^>]+>/g, ' ').trim() + '\n';
    }
    if (quoteMatch) {
      extractedContent += quoteMatch[1].replace(/<[^>]+>/g, ' ').trim() + '\n';
    }
    if (paragraphs) {
      paragraphs.forEach(p => {
        extractedContent += p.replace(/<[^>]+>/g, ' ').trim() + '\n';
      });
    }
    
    // Also try to get rate data
    const rateMatches = html.match(/(\d+\.\d+)%/g);
    
    console.log('Extracted content length:', extractedContent.length);
    console.log('Found rate matches:', rateMatches?.slice(0, 4));
    
    // Use Lovable AI to summarize the content for sellers
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    const prompt = `You are a real estate agent writing a brief summary of the Freddie Mac weekly mortgage rate report for home sellers. 

Here is content from the Freddie Mac Primary Mortgage Market Survey page:

${extractedContent || 'Unable to extract specific content from the page.'}

Rate data found: ${rateMatches?.slice(0, 6).join(', ') || 'No specific rates extracted'}

Write a 2-3 sentence summary that:
1. Mentions what happened with mortgage rates this week (up, down, or stable)
2. Explains what this means for the housing market
3. Is written in a professional but approachable tone for home sellers

Keep it concise and seller-focused. Do not use bullet points. Just provide the summary text directly.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content?.trim();
    
    console.log('Generated summary:', summary);

    return new Response(JSON.stringify({ 
      success: true,
      summary: summary || 'Mortgage rates continue to be a key factor in buyer demand. Current market conditions suggest sellers should remain aware of how rate changes impact buyer purchasing power and overall market activity.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error fetching Freddie Mac data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage,
      summary: 'Mortgage rates continue to influence buyer purchasing power and overall market activity. Sellers should monitor weekly rate changes as they can impact buyer demand and time on market.'
    }), {
      status: 200, // Return 200 with fallback summary
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
