import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const platformPrompts: Record<string, string> = {
  facebook: `You are a real estate social media expert. Create an engaging Facebook post for this property listing. Include emojis, relevant hashtags, and a compelling call to action. Keep it under 300 words. Format with line breaks for readability.`,
  instagram: `You are a real estate Instagram expert. Create a captivating Instagram caption for this property listing. Use relevant emojis, up to 20 hashtags at the end, and an engaging hook in the first line. Keep the caption under 250 words.`,
  youtube: `You are a real estate video marketing expert. Create a YouTube video title (under 60 chars), description (under 500 words with timestamps placeholder), and 10 relevant tags for this property listing. Format as:\n\nTITLE: ...\n\nDESCRIPTION:\n...\n\nTAGS: tag1, tag2, ...`,
  linkedin: `You are a real estate professional on LinkedIn. Create a professional yet engaging LinkedIn post for this property listing. Focus on investment value, neighborhood highlights, and market insights. Keep it under 250 words. Include 3-5 relevant hashtags.`,
  twitter: `You are a real estate Twitter/X expert. Create 3 tweet variations for this property listing. Each tweet must be under 280 characters and include 2-3 hashtags. Format each on its own line prefixed with "TWEET 1:", "TWEET 2:", "TWEET 3:".`,
  "paid-ads": `You are a digital advertising expert for real estate. Create ad copy for this property listing in these formats:\n\n1. Google Search Ad (3 headlines of 30 chars each, 2 descriptions of 90 chars each)\n2. Facebook/Instagram Ad (headline, primary text under 125 chars, description)\n3. Display Ad (short headline, long headline, description)\n\nLabel each section clearly.`,
  "ai-suggestions": `You are a real estate marketing strategist. Analyze this property listing and provide:\n\n1. **Listing Description Improvements** - Suggest 3 specific ways to improve the description\n2. **Pricing Strategy** - Comment on the price per sqft and positioning\n3. **Target Buyer Profile** - Describe the ideal buyer for this property\n4. **Marketing Channels** - Recommend the top 3 marketing channels and why\n5. **Staging & Photo Tips** - Suggest improvements for visual presentation\n6. **Competitive Advantages** - Highlight the top 3 selling points to emphasize\n\nBe specific and actionable. Reference actual details from the listing.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { listing, platform } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = platformPrompts[platform];
    if (!systemPrompt) throw new Error(`Unknown platform: ${platform}`);

    const listingContext = `Property Details:
- Address: ${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}
- Price: $${Number(listing.price).toLocaleString()}
- Bedrooms: ${listing.beds} | Bathrooms: ${listing.baths}
- Square Feet: ${Number(listing.sqft).toLocaleString()}
- Year Built: ${listing.yearBuilt}
- Property Type: ${listing.propertyType}
- Lot Size: ${listing.lotSize}
- Days on Market: ${listing.daysOnMarket}
- Status: ${listing.status}
- Description: ${listing.description || 'N/A'}
- Features: ${(listing.features || []).join(', ') || 'N/A'}
- School District: ${listing.schoolDistrict || 'N/A'}
- HOA: ${listing.hoaFee ? `$${listing.hoaFee}/${listing.hoaFrequency}` : 'None'}
- Agent: ${listing.agent?.name || 'N/A'}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: listingContext },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-listing-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
