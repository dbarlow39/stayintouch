import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a professional real estate agent with The Barlow Group at SellFor1Percent.com. Your style is professional, friendly, data-driven, and focused on helping homeowners make informed decisions. You use the Bullseye Pricing Model - pricing precisely at the top of the buyer's search bracket to attract maximum buyer interest and achieve the highest net sale price without reductions.

You will receive uploaded documents for a seller market analysis. Extract and analyze all data, then produce a complete structured analysis.

BULLSEYE PRICE BRACKET REFERENCE:
Buyer search brackets occur at every $25,000 increment. To determine the three prices:
1. Identify which $25K bracket the recommended Bullseye falls in (e.g. $400K-$425K)
2. Bullseye price = top of that bracket minus $100 (e.g. $424,900)
3. Lower bracket price = top of the bracket below minus $100 (e.g. $399,900)
4. Upper bracket price = top of the bracket above minus $100 (e.g. $449,900)

Always use the HIGHER bracket price as the Bullseye - never the lower number.

IMPORTANT RULES:
- No em dashes anywhere - use a plain hyphen (-) instead
- Tax assessed value is never used as a pricing benchmark - always note it lags market
- Zestimate is never used as a pricing input - only as a framing/narrative tool
- All comp data must come from the attached CMA - never invent or estimate figures`;

const USER_PROMPT = `Analyze the attached documents and return a JSON response with the following structure. Extract ALL data from the documents - do not invent any figures.

Return valid JSON with this exact structure:
{
  "propertyOverview": {
    "address": "",
    "owners": "",
    "style": "",
    "bedroomsBaths": "",
    "aboveGradeSqFt": "",
    "finishedBasement": "",
    "lotSize": "",
    "yearBuilt": "",
    "garage": "",
    "subdivision": "",
    "hoa": "",
    "countyMarketValue": "",
    "annualPropertyTax": "",
    "lastPurchasePriceDate": "",
    "twoYearAppreciation": "",
    "q1PriceForecast": "",
    "zillowZestimate": ""
  },
  "notableFeatures": ["feature 1", "feature 2"],
  "comparableSales": {
    "closedSales": [{"address":"","closedDate":"","listPrice":"","soldPrice":"","bedsBaths":"","sqFt":"","yearBuilt":"","dom":""}],
    "activeListings": [{"address":"","listedDate":"","listPrice":"","status":"","bedsBaths":"","sqFt":"","yearBuilt":"","dom":""}],
    "summaryStats": {
      "soldPrice": {"low":"","average":"","median":"","high":""},
      "listPrice": {"low":"","average":"","median":"","high":""},
      "sqFt": {"low":"","average":"","median":"","high":""},
      "dom": {"low":"","average":"","median":"","high":""},
      "soldToListRatio": {"low":"","average":"","median":"","high":""}
    },
    "howYourHomeCompares": ""
  },
  "communityInsights": {
    "schoolDistrict": "",
    "familyFriendlyScore": "",
    "crimeRiskScore": "",
    "walkabilityScore": "",
    "floodZone": "",
    "subdivision": "",
    "hoa": "",
    "lotNotes": "",
    "narrative": ""
  },
  "marketConditions": {
    "marketNarrative": "",
    "onlineValuationCaution": ""
  },
  "zillowAnalysis": {
    "zestimate": "",
    "estimatedSalesRange": "",
    "rentZestimate": "",
    "pricePerSqFt": "",
    "bedsBathsAsZillowCounts": "",
    "propertyType": "",
    "yearBuilt": "",
    "updatedDate": "",
    "appreciationNote": "",
    "importantContext": "",
    "wordOnZestimate": "",
    "onlineValuationNote": "A note on online valuation tools: Zillow's Zestimate and similar automated valuation models rely on algorithm-driven estimates that often lag actual market conditions and cannot account for your home's specific upgrades, custom finishes, or location premium within the subdivision. The data-driven, agent-guided comparable analysis presented here reflects what real buyers are actually paying in your specific market today."
  },
  "pricingStrategy": {
    "bullseyePrice": "",
    "lowerBracketPrice": "",
    "upperBracketPrice": "",
    "bullseyeBracket": "",
    "lowerBracket": "",
    "upperBracket": "",
    "lowerBracketDescription": "",
    "bullseyeDescription": "",
    "upperBracketDescription": "",
    "bullseyeExplanation": "",
    "bracketAnalysis": "",
    "priceJustification": ""
  },
  "salutation": {
    "firstNames": "",
    "introductionParagraph": ""
  },
  "nextSteps": "",
  "agentName": "Dave Barlow",
  "preparedDate": ""
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documents } = await req.json();

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build multimodal content array
    const userContent: any[] = [{ type: "text", text: USER_PROMPT }];

    for (const doc of documents) {
      if (doc.mimeType && doc.base64) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${doc.mimeType};base64,${doc.base64}`
          }
        });
      }
    }

    console.log(`Processing ${documents.length} documents for market analysis`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content?.trim() || "";

    // Extract JSON from the response (may be wrapped in markdown code blocks)
    let jsonStr = rawContent;
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response as JSON:", rawContent.substring(0, 500));
      throw new Error("AI returned invalid JSON. Please try again.");
    }

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating market analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
