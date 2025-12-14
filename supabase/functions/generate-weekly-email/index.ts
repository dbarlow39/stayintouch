import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketData {
  week_of: string;
  active_homes: number;
  active_homes_last_week: number | null;
  inventory_change: number | null;
  market_avg_dom: number;
  price_trend: 'up' | 'down' | 'stable';
  price_reductions: number;
}

interface ClientData {
  first_name: string;
  last_name: string;
  street_number: string;
  street_name: string;
  city: string;
  state: string;
  zip: string;
  zillow_views: number | null;
  zillow_saves: number | null;
  zillow_days: number | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    console.log('Request body keys:', Object.keys(requestBody));
    console.log('Template received:', requestBody.template ? `${requestBody.template.substring(0, 100)}...` : 'NO TEMPLATE');
    
    // Support both camelCase and snake_case parameter names
    const market_data: MarketData = requestBody.market_data || requestBody.marketData;
    const client_data: ClientData = requestBody.client_data || requestBody.clientData;
    const customTemplate: string | undefined = requestBody.template;
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const propertyAddress = `${client_data.street_number} ${client_data.street_name}, ${client_data.city}, ${client_data.state} ${client_data.zip}`;
    
    // Calculate expected showings and offers based on views
    const views = client_data.zillow_views || 0;
    const expectedShowingsMin = Math.floor(views / 200) * 2;
    const expectedShowingsMax = Math.floor(views / 200) * 4;
    const expectedOffers = Math.floor(expectedShowingsMax / 8);

    // Use custom template if provided - send directly without AI regeneration
    if (customTemplate && customTemplate.trim()) {
      console.log('Using custom template directly (no AI generation)');
      
      // Replace variables in the custom template
      const processedTemplate = customTemplate
        .replace(/\{first_name\}/g, client_data.first_name || '')
        .replace(/\{last_name\}/g, client_data.last_name || '')
        .replace(/\{property_address\}/g, propertyAddress)
        .replace(/\{street_number\}/g, client_data.street_number || '')
        .replace(/\{street_name\}/g, client_data.street_name || '')
        .replace(/\{city\}/g, client_data.city || '')
        .replace(/\{state\}/g, client_data.state || '')
        .replace(/\{zip\}/g, client_data.zip || '')
        .replace(/\{week_of\}/g, market_data.week_of || '')
        .replace(/\{active_homes\}/g, String(market_data.active_homes || 0))
        .replace(/\{active_homes_last_week\}/g, String(market_data.active_homes_last_week || 'N/A'))
        .replace(/\{inventory_change\}/g, market_data.inventory_change !== null ? String(market_data.inventory_change) : 'N/A')
        .replace(/\{market_avg_dom\}/g, String(market_data.market_avg_dom || 0))
        .replace(/\{price_trend\}/g, market_data.price_trend || 'stable')
        .replace(/\{price_reductions\}/g, String(market_data.price_reductions || 0))
        .replace(/\{zillow_views\}/g, String(client_data.zillow_views || 'N/A'))
        .replace(/\{zillow_saves\}/g, String(client_data.zillow_saves || 'N/A'))
        .replace(/\{zillow_days\}/g, String(client_data.zillow_days || 'N/A'))
        .replace(/\{expected_showings_min\}/g, String(expectedShowingsMin))
        .replace(/\{expected_showings_max\}/g, String(expectedShowingsMax))
        .replace(/\{expected_offers\}/g, String(expectedOffers));
      
      // Extract subject and body from template (first line is subject)
      const lines = processedTemplate.split('\n');
      let subject = 'Weekly Market Update';
      let body = processedTemplate;
      
      // Check if first line looks like a subject line
      const firstLine = lines[0].trim();
      if (firstLine.toLowerCase().startsWith('subject:')) {
        subject = firstLine.replace(/^subject:\s*/i, '').trim();
        body = lines.slice(1).join('\n').trim();
      } else if (!firstLine.toLowerCase().startsWith('dear') && !firstLine.toLowerCase().startsWith('hi') && firstLine.length < 100) {
        // First line is short and doesn't look like a greeting - treat as subject
        subject = firstLine;
        body = lines.slice(1).join('\n').trim();
      }
      
      return new Response(JSON.stringify({ subject, body }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // No custom template - use AI to generate
    const prompt = `Generate a weekly seller market update email for a real estate client.

MARKET DATA:
- Week of: ${market_data.week_of}
- Active homes on market: ${market_data.active_homes}
- Active homes last week: ${market_data.active_homes_last_week || 'N/A'}
- Inventory change: ${market_data.inventory_change !== null ? (market_data.inventory_change > 0 ? '+' : '') + market_data.inventory_change : 'N/A'}
- Market average Days on Market (DOM): ${market_data.market_avg_dom}
- Price trend: ${market_data.price_trend}
- Homes with price reductions: ${market_data.price_reductions}

CLIENT LISTING INFORMATION:
- Client name: ${client_data.first_name} ${client_data.last_name}
- Property address: ${propertyAddress}

ZILLOW PERFORMANCE:
- Days on Zillow: ${client_data.zillow_days || 'N/A'}
- Total views: ${client_data.zillow_views || 'N/A'}
- Total saves: ${client_data.zillow_saves || 'N/A'}

CONVERSION METRICS TO INCLUDE:
Based on ${views} views, the expected showings range is ${expectedShowingsMin}-${expectedShowingsMax} and expected offers is ${expectedOffers}.

INSTRUCTIONS:
1. Subject Line: "Weekly Market Update – ${propertyAddress}"
2. Greeting: Address ${client_data.first_name} by first name
3. Columbus Market Snapshot: Present the market data with week-over-week comparison
4. What This Means for Sellers: Translate data into plain English, emphasize seasonal normalcy
5. Your Property Performance: Present days on market, views, and saves (do NOT mention Zillow by name)
6. How Views Convert to Showings and Offers: Use this exact framework:
   - Every 200 views → 2-4 showings
   - Every 7-8 showings → 1 offer
   - State: "We have generated ${views} online views which means we should have between ${expectedShowingsMin} and ${expectedShowingsMax} in person showings and at least ${expectedOffers} offer at this point."
7. Weekly Outlook: Measured, data-driven expectations for next week
8. Closing: Sign as:
   Dave Barlow
   Sell for 1 Percent Realtors
   📞 614-778-6616
   🌐 www.Sellfor1Percent.com

TONE REQUIREMENTS:
- Conservative, calm, factual, and reassuring
- No hype, urgency, sales language, or speculation
- Use phrases like "holding steady", "within normal seasonal ranges", "buyer interest remains selective"
- NEVER use: "hot market", "act now", "urgent", "guaranteed", "perfect time"
- Keep it professional and supportive

LENGTH: 600-750 words

FORMAT: Return ONLY the email content (subject line on first line, then body). Do not include any JSON or markdown formatting.`;

    console.log('Generating email with Lovable AI...', customTemplate ? '(using custom template)' : '(using default prompt)');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a professional real estate market analyst writing personalized weekly update emails for home sellers in Columbus, Ohio. Your tone is always conservative, calm, factual, and reassuring. Never use hype or urgency.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits to your account.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const emailContent = aiData.choices[0].message.content;

    // Parse subject and body from the response
    const lines = emailContent.split('\n');
    let subject = '';
    let body = '';
    
    // First non-empty line is likely the subject
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        if (line.toLowerCase().startsWith('subject:')) {
          subject = line.replace(/^subject:\s*/i, '').trim();
        } else if (!subject) {
          subject = line;
        } else {
          body = lines.slice(i).join('\n').trim();
          break;
        }
      }
    }

    // Clean up subject if it has the label
    subject = subject.replace(/^subject:\s*/i, '').trim();

    console.log('Email generated successfully');

    return new Response(JSON.stringify({ 
      subject,
      body,
      property_address: propertyAddress
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating email:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
