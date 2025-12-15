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
    
    const toPlainText = (input: string) =>
      input
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

    // Prefer the PMMS news section if present (more focused than the whole page)
    const pmmsNewsMatch = html.match(
      /<div[^>]*class="[^"]*pmms-news[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    );
    const sourceHtml = pmmsNewsMatch?.[1] || html;
    const plainText = toPlainText(sourceHtml);

    const extractRates = (term: "30-year" | "15-year") => {
      const idx = plainText.toLowerCase().indexOf(term);
      if (idx < 0) return { current: undefined, weekAgo: undefined, yearAgo: undefined };

      const slice = plainText.slice(idx, idx + 900);

      const currentMatch = slice.match(
        new RegExp(
          `${term}\\s+fixed-rate\\s+mortgage[^.]{0,180}?averaged\\s+(\\d+(?:\\.\\d+)?)\\s*percent`,
          "i"
        )
      );
      const weekAgoMatch = slice.match(/last week[^.]{0,180}?(\d+(?:\.\d+)?)\s*percent/i);
      const yearAgoMatch = slice.match(
        /(a|one) year ago[^.]{0,220}?(\d+(?:\.\d+)?)\s*percent/i
      );

      const current = currentMatch ? parseFloat(currentMatch[1]) : undefined;
      const weekAgo = weekAgoMatch ? parseFloat(weekAgoMatch[1]) : undefined;
      const yearAgo = yearAgoMatch ? parseFloat(yearAgoMatch[2]) : undefined;

      return { current, weekAgo, yearAgo };
    };

    const r30 = extractRates("30-year");
    const r15 = extractRates("15-year");

    const ytdAvgMatch = plainText.match(
      /year[- ]to[- ]date average[^0-9]{0,40}(\d+(?:\.\d+)?)\s*percent/i
    );
    const ytdAverage = ytdAvgMatch ? parseFloat(ytdAvgMatch[1]) : undefined;

    // Build a short "What Freddie Mac Says" snippet without AI (avoid misreads)
    const safeText = plainText.replace(/(\d)\.(\d)/g, "$1§$2");
    const headline =
      html.match(/<h[12][^>]*>\s*([^<]*Mortgage Rates[^<]*)<\/h[12]>/i)?.[1]?.trim() ||
      "";
    const mortgageSentence =
      safeText.match(/Mortgage rates[^.!?]{0,260}[.!?]/i)?.[0]?.replace(/§/g, ".") ||
      "";
    const ytdSentence =
      safeText.match(/year[- ]to[- ]date average[^.!?]{0,260}[.!?]/i)?.[0]?.replace(/§/g, ".") ||
      "";

    const extractedSummary = [headline, mortgageSentence, ytdSentence]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const rates = {
      mortgage_rate_30yr: r30.current,
      mortgage_rate_30yr_week_ago: r30.weekAgo,
      mortgage_rate_30yr_year_ago: r30.yearAgo,
      mortgage_rate_15yr: r15.current,
      mortgage_rate_15yr_week_ago: r15.weekAgo,
      mortgage_rate_15yr_year_ago: r15.yearAgo,
      year_to_date_average_30yr: ytdAverage,
    };

    const hasRates = Object.values(rates).some(
      (v) => typeof v === "number" && Number.isFinite(v)
    );

    console.log("Parsed PMMS rates:", rates);
    if (extractedSummary) console.log("Extracted PMMS summary:", extractedSummary);

    if (hasRates || extractedSummary) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: extractedSummary || null,
          rates,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fallback: give AI only the most relevant text chunk
    const pmmsIdx = plainText.toLowerCase().indexOf("primary mortgage market survey");
    let extractedContent = pmmsIdx >= 0 ? plainText.slice(pmmsIdx, pmmsIdx + 3500) : plainText;
    extractedContent = extractedContent.slice(0, 3000);

    console.log('Fallback extracted PMMS content length:', extractedContent.length);
    console.log('Fallback content preview:', extractedContent.slice(0, 500));
    
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
