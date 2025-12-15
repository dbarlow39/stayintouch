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
    
    // Extract more content - get all paragraph text and any quotes
    const allParagraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const blockquotes = html.match(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi) || [];
    const headings = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || [];
    
    // Clean and combine content
    let extractedContent = '';
    
    [...headings, ...blockquotes, ...allParagraphs].forEach(tag => {
      const text = tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 20 && !text.includes('cookie') && !text.includes('privacy')) {
        extractedContent += text + '\n';
      }
    });
    
    // Limit content to avoid token limits
    extractedContent = extractedContent.slice(0, 4000);
    
    console.log('Extracted content length:', extractedContent.length);
    console.log('Content preview:', extractedContent.slice(0, 500));
    
    // Use Lovable AI to summarize the content for sellers
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }
    
    const prompt = `You are a real estate agent summarizing the Freddie Mac weekly mortgage rate report for home sellers.

Here is content from the Freddie Mac Primary Mortgage Market Survey (PMMS) page:

${extractedContent || 'Unable to extract specific content from the page.'}

IMPORTANT INSTRUCTIONS:
- Read the content CAREFULLY and accurately report what Freddie Mac said
- Do NOT misinterpret numbers - if it says rates are "below the year-to-date average of X%", that means X% is the AVERAGE, not the current rate
- If it mentions comparisons (e.g., "well below", "higher than"), accurately convey those comparisons
- Quote or paraphrase the actual Freddie Mac commentary, don't make up interpretations

Write a 2-3 sentence summary that:
1. Accurately states what happened with mortgage rates this week based on what Freddie Mac reported
2. Includes any key context they provided (comparisons to averages, trends, etc.)
3. Is written in a professional tone for home sellers

Just provide the summary text directly, no bullet points or formatting.`;

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
