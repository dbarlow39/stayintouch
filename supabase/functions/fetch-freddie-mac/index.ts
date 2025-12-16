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

    // Use FULL page text for rate parsing (the "The 30-year FRM averaged..." sentences may not be inside pmms-news)
    const plainTextFull = toPlainText(html);
    const plainTextNews = toPlainText(pmmsNewsMatch?.[1] || html);

    // Parse using Freddie Mac's stable wording patterns (matches provided sample):
    // "The 30-year FRM averaged X% ... last week when it averaged Y% ... A year ago at this time, the 30-year FRM averaged Z%"
    // NOTE: Support both "30-year FRM" and "30-year fixed-rate mortgage (FRM)" variants.
    const extractRates = (term: "30-year" | "15-year") => {
      const rateBlockRegex = new RegExp(
        [
          `The\\s+${term}\\s+(?:fixed-rate\\s+mortgage(?:\\s*\\(FRM\\))?|FRM)\\s+averaged\\s+(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)`,
          `[\\s\\S]{0,260}?last week when it averaged\\s+(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)`,
          `[\\s\\S]{0,360}?A year ago at this time,\\s*the\\s+${term}\\s+(?:fixed-rate\\s+mortgage(?:\\s*\\(FRM\\))?|FRM)\\s+averaged\\s+(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)`,
        ].join(""),
        "i"
      );

      const blockMatch = plainTextFull.match(rateBlockRegex);

      const current = blockMatch ? parseFloat(blockMatch[1]) : undefined;
      const weekAgo = blockMatch ? parseFloat(blockMatch[2]) : undefined;
      const yearAgo = blockMatch ? parseFloat(blockMatch[3]) : undefined;

      console.log(`Parsed ${term} rates:`, { current, weekAgo, yearAgo });
      return { current, weekAgo, yearAgo };
    };

    const r30 = extractRates("30-year");
    const r15 = extractRates("15-year");

    const ytdAvgMatch = plainTextFull.match(
      /year[- ]to[- ]date average[^0-9]{0,40}(\d+(?:\.\d+)?)\s*(?:%|percent)/i
    );
    const ytdAverage = ytdAvgMatch ? parseFloat(ytdAvgMatch[1]) : undefined;

    const rates = {
      mortgage_rate_30yr: r30.current ?? null,
      mortgage_rate_30yr_week_ago: r30.weekAgo ?? null,
      mortgage_rate_30yr_year_ago: r30.yearAgo ?? null,
      mortgage_rate_15yr: r15.current ?? null,
      mortgage_rate_15yr_week_ago: r15.weekAgo ?? null,
      mortgage_rate_15yr_year_ago: r15.yearAgo ?? null,
      year_to_date_average_30yr: ytdAverage ?? null,
    };

    console.log("Parsed PMMS rates:", rates);

    // Extract content for AI summarization - find the editorial section
    // Look for the h3 headline like "Mortgage Rates Remain Near 2025 Lows" and the paragraphs after
    const editorialMatch = html.match(
      /<h3[^>]*>([^<]*(?:Mortgage Rates|Rates)[^<]*)<\/h3>\s*([\s\S]{0,2000}?)(?=<h[23]|<div class="(?:compare|chart))/i
    );
    
    let editorialContent = "";
    if (editorialMatch) {
      const headline = editorialMatch[1].trim();
      const bodyHtml = editorialMatch[2];
      const bodyText = toPlainText(bodyHtml);
      editorialContent = `${headline}\n\n${bodyText}`;
    } else {
      // Fallback: extract from plain text around "year-to-date average"
      const ytdIdx = plainTextFull.toLowerCase().indexOf("year-to-date average");
      if (ytdIdx > 0) {
        editorialContent = plainTextFull.slice(Math.max(0, ytdIdx - 200), ytdIdx + 300);
      }
    }

    console.log("Editorial content for AI:", editorialContent.slice(0, 500));

    // Use AI to generate a proper summary for the "What Freddie Mac Says" section
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiSummary: string | null = null;

    if (LOVABLE_API_KEY && editorialContent) {
      try {
        const prompt = `You are summarizing Freddie Mac's weekly mortgage rate commentary for home sellers.

Here is the editorial content from this week's Freddie Mac PMMS report:

${editorialContent}

Write a 2-3 sentence summary that:
1. Captures the main point Freddie Mac is making about current mortgage rates
2. Includes any context about how rates compare to averages or trends
3. Is written in a professional, informative tone for home sellers

Just provide the summary text directly, no bullet points or formatting. Do not start with "Freddie Mac says" or similar - just state the information directly.`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiSummary = aiData.choices?.[0]?.message?.content?.trim() || null;
          console.log('AI generated summary:', aiSummary);
        } else {
          console.error('AI API error:', aiResponse.status);
        }
      } catch (aiErr) {
        console.error('AI summarization error:', aiErr);
      }
    }

    // Fallback summary if AI fails
    const fallbackSummary = "Mortgage rates continue to be a key factor in buyer demand. Current market conditions suggest sellers should remain aware of how rate changes impact buyer purchasing power and overall market activity.";

    return new Response(
      JSON.stringify({
        success: true,
        summary: aiSummary || fallbackSummary,
        rates,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error('Error fetching Freddie Mac data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage,
      summary: 'Mortgage rates continue to influence buyer purchasing power and overall market activity. Sellers should monitor weekly rate changes as they can impact buyer demand and time on market.',
      rates: {},
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
