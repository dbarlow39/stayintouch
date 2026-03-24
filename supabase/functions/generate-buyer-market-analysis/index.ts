import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUYER_SYSTEM_PROMPT = `You are a professional real estate analyst for The Barlow Group at SellFor1Percent.com. You are preparing a Buyer Market Analysis to help buyers understand whether a property they are interested in is fairly priced.

You determine a Buyer's Purchase Range - a Low price and a High price - based on comparable sales data. The goal is to protect the buyer from overpaying.

BUYER'S PURCHASE RANGE RULES:
- Analyze all closed comp sold prices to determine the realistic purchase range
- lowPrice: the low end of what the buyer should expect to pay, derived from the lowest relevant comp sales adjusted for differences. Round to the nearest $1,000 minus $100 (e.g. $399,900, $424,900)
- highPrice: the high end of what the buyer should expect to pay, derived from the highest relevant comp sales adjusted for differences. Round to the nearest $1,000 minus $100 (e.g. $449,900, $474,900)
- The range should reflect where the property's true market value falls based on comps
- A narrower range indicates stronger comp alignment; a wider range means more variability in the market data

ZESTIMATE FRAMING RULES (BUYER PERSPECTIVE):

SCENARIO A - Zestimate is HIGHER than the high end of the purchase range:
The zillowWordOn field must be a full paragraph of 4-5 sentences that:
1. Notes the Zestimate by its exact dollar amount and acknowledges the buyer may have seen it
2. Explains WHY it is higher - Zillow may have counted finished basement bedrooms/bathrooms, inflating the bed/bath/sqft profile beyond the above-grade reality
3. Explains that this inflated profile is not how buyers, appraisers, or MLS data classify above-grade square footage
4. States that the algorithm cannot see the difference between above-grade and basement space, and cannot account for the actual condition or needed updates
5. Closes by stating that the actual closed sales - real transactions - tell a more accurate story and support a lower true market value, which is good news for the buyer

SCENARIO B - Zestimate is LOWER than the low end of the purchase range:
The zillowWordOn field must be a full paragraph of 3-4 sentences that:
1. Notes the Zestimate by its exact dollar amount
2. Explains that the actual comp data supports a higher value than Zillow suggests
3. Names specific features and upgrades that justify the higher value
4. Notes that while the buyer should expect to pay more than the Zestimate, the purchase range still represents fair market value

SCENARIO C - Zestimate is within the purchase range:
The zillowWordOn field must be a full paragraph of 3-4 sentences that:
1. Notes the Zestimate falls within the data-driven purchase range
2. Uses this as validation - when both the algorithm and the comp analysis agree, it gives high confidence in the value
3. Notes that this gives the buyer confidence the asking price (if within range) is fair

FOR ALL SCENARIOS - the zillowNoteOn field must always be exactly this sentence, word for word:
"A note on online valuation tools: Zillow's Zestimate and similar automated valuation models rely on algorithm-driven estimates that often lag actual market conditions and cannot account for specific upgrades, custom finishes, or location premium within the subdivision. The data-driven, agent-guided comparable analysis presented here reflects what real buyers are actually paying in your specific market today."

WRITING RULES:
- No em dashes - use a plain hyphen (-) instead
- Professional, warm, data-driven tone
- Address buyers by FIRST NAMES ONLY (e.g. "Dear John and Jane,") - never use last names in the salutation or intro paragraph
- Never invent data - only use figures from the attached documents
- Features must be specific: brand names, ages, warranties where stated
- Review all property photos for value factors and incorporate observations
- For the features array: cross-reference ALL attached documents to build the most complete feature list possible
- SQUARE FOOTAGE ACCURACY: CMA reports sometimes copy the total building square footage into the "Basement Sq Feet" field incorrectly. Never trust the CMA basement sq ft field if it matches or is close to the above-grade sq ft. Cross-reference all documents.
- TOTAL FINISHED SQ FT: Always calculate totalFinishedSqFt as the above-grade sq ft PLUS the finished basement sq ft.
- MARKET CONDITIONS NARRATIVE (BUYER PERSPECTIVE): The marketConditions field must help the buyer understand the current market dynamics. It must include:
  1. Name the local area and describe buyer demand, inventory levels, and whether it favors buyers or sellers
  2. Reference each closed comp's days on market individually by address - show the buyer how fast homes are moving
  3. Name any active competitor listings and their asking prices so the buyer can compare options
  4. Reference appreciation data if available
  5. Close with guidance on what this means for the buyer's negotiating position and timing
- TAX NOTE: The taxNote field must follow this template: "A note on the county's assessed market value of [county market value]: tax assessments in Ohio typically lag actual market conditions by two to three years and should not be used as a pricing benchmark. The comparable sales data below is a far more accurate reflection of current buyer demand."
- COMP COMPARISON BULLETS (BUYER PERSPECTIVE): Each bullet must help the buyer understand how the subject property compares to what else has sold or is available. Written to help the buyer evaluate the property's value:
  Bullet 1 - RELEVANCE: What makes the comps valid benchmarks for this property
  Bullet 2 - SQUARE FOOTAGE: How the subject's size compares - is the buyer getting more or less space for the money?
  Bullet 3 - AGE AND CONDITION: How old is the property vs comps? What updates does it have or need?
  Bullet 4 - BEST DEALS AND CLOSEST MATCH: Name the lowest-priced comp and the most similar comp - what did buyers pay for comparable homes?
  Bullet 5 - ACTIVE ALTERNATIVES: What else can the buyer look at? How does this property stack up?
  Each bullet must be 2-3 sentences with specific addresses, prices, and details.
- PURCHASE RANGE NARRATIVE PARAGRAPHS (BUYER PERSPECTIVE):
  purchaseRangeExplain - MUST be exactly: "When we price a home to be listed for sale we use the same technique as we are using here. We look at the comps, make adjustments because no 2 homes are exactly the same and then we generate a Buyer's Purchase Range. Our model is built on the principle that pricing precisely at true market value will ensure you don't overpay for the property. We use recently sold comparables as listed in the MLS, the same that an appraiser would do. We then add or subtract value depending on what the comps have to offer or not and then we come up with a suggested purchase range for the subject home (the one you are interested in)."
  priceJustification - MUST follow this structure: "Our recommended purchase range of [lowPrice] to [highPrice] is grounded in what the market evidence clearly supports. At the low end, [lowPrice] would represent a strong value for the buyer, likely reflecting a property that needs some updates or a motivated seller. At the high end, [highPrice] represents the upper boundary - the home should be in excellent condition with desirable updates to justify this price. [Continue to add and illustrate the reasoning for the price range using specific comparable sales data, addresses, and property details from the documents.]"
  nextSteps - MUST be exactly: "Take a look at this information and the attached analysis and let me know your thoughts and questions. I am happy to walk through any of this in detail with you and to put together a winning purchase offer for you."`;

const BUYER_USER_PROMPT = `FEATURES WRITING RULES - apply these when populating the features array:

- Write each bullet as a complete, specific sentence - not a fragment
- Combine related items into single bullets
- Always include brand names, ages, and warranty details exactly as stated in the documents
- Always note inclusion/exclusion status where stated
- Note finished basement square footage and total finished living area
- Note roof type, age status, and layer count
- Note furnace type, AC type, hot water type, and any sump pump
- Note window brand, style, and insulation
- Note lot features such as wooded backing, patio, porch, landscaping
- Aim for 12-15 bullets minimum
- Never list a feature without its relevant detail

Analyze the attached documents and return your analysis as a JSON object matching this exact schema:

{
  "property": {
    "address": "",
    "city": "",
    "state": "",
    "zip": "",
    "owner1": "",
    "owner2": "",
    "style": "",
    "bedrooms": "",
    "baths": "",
    "aboveGradeSqFt": "",
    "basementSqFt": "",
    "totalFinishedSqFt": "",
    "lotAcres": "",
    "lotDimensions": "",
    "yearBuilt": "",
    "builder": "",
    "garage": "",
    "subdivision": "",
    "hoa": "",
    "hoaAmenities": "",
    "countyMarketValue": "",
    "annualTax": "",
    "taxYear": "",
    "lastSalePrice": "",
    "lastSaleDate": "",
    "appreciation2yr": "",
    "q1Forecast": "",
    "zestimate": "",
    "zestimateRange": "",
    "zestimateRent": "",
    "zestimatePsf": "",
    "zillowBeds": "",
    "zillowBaths": "",
    "zillowSqFt": "",
    "zillowAppreciation10yr": "",
    "zillowUpdatedMonth": ""
  },

IMPORTANT DATA RULES FOR SQUARE FOOTAGE:
- aboveGradeSqFt: the above-ground living area only, from the CMA or auditor record
- basementSqFt: the FINISHED basement square footage ONLY - this is a separate, smaller number than aboveGradeSqFt. Find it in the walk-through summary or inspection worksheet. If the CMA "Basement Sq Feet" field matches the above-grade sq ft exactly, that field is a data error - ignore it.
- totalFinishedSqFt: add aboveGradeSqFt + basementSqFt together to get this number

  "features": [""],
  "closedComps": [
    {
      "address": "",
      "closedDate": "",
      "listPrice": "",
      "soldPrice": "",
      "beds": "",
      "baths": "",
      "sqFt": "",
      "yearBuilt": "",
      "dom": ""
    }
  ],
  "activeComps": [
    {
      "address": "",
      "listedDate": "",
      "listPrice": "",
      "beds": "",
      "baths": "",
      "sqFt": "",
      "yearBuilt": "",
      "dom": ""
    }
  ],
  "compStats": {
    "soldLow": "",
    "soldAvg": "",
    "soldMedian": "",
    "soldHigh": "",
    "listLow": "",
    "listAvg": "",
    "listMedian": "",
    "listHigh": "",
    "sqFtLow": "",
    "sqFtAvg": "",
    "sqFtMedian": "",
    "sqFtHigh": "",
    "domLow": "",
    "domAvg": "",
    "domMedian": "",
    "domHigh": "",
    "soldToListLow": "",
    "soldToListAvg": "",
    "soldToListMedian": "",
    "soldToListHigh": ""
  },
  "community": {
    "schoolDistrict": "",
    "testRank": "",
    "familyScore": "",
    "crimeScore": "",
    "walkScore": "",
    "floodZone": "",
    "subdivision": "",
    "township": ""
  },
  "pricing": {
    "lowPrice": "",
    "highPrice": ""
  },
  "narrative": {
    "intro": "",
    "taxNote": "",
    "compComparison": [""],
    "communityParagraph": "",
    "marketConditions": "",
    "zillowWordOn": "",
    "zillowNoteOn": "",
    "purchaseRangeExplain": "",
    "priceJustification": "",
    "nextSteps": "",
    "zillowContextNote": ""
  }
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documents, agentNotes, buyerNames } = await req.json();

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userContent: any[] = [];

    for (const doc of documents) {
      if (!doc.filePath) continue;

      const mimeType = doc.mimeType || "application/pdf";
      console.log(`Processing ${doc.name}: ${mimeType}`);

      if (mimeType.includes("wordprocessingml") || doc.filePath.endsWith(".docx")) {
        console.log(`Downloading docx for text extraction: ${doc.name}`);
        const { data: fileData, error: downloadError } = await supabase.storage
          .from("market-analysis-docs")
          .download(doc.filePath);

        if (downloadError) {
          console.error(`Failed to download ${doc.name}:`, downloadError);
          continue;
        }

        try {
          const arrayBuffer = await fileData.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          const docXml = await zip.file("word/document.xml")?.async("string");
          if (docXml) {
            const textContent = docXml
              .replace(/<\/w:p>/g, "\n")
              .replace(/<w:br[^>]*\/>/g, "\n")
              .replace(/<w:tab[^>]*\/>/g, "\t")
              .replace(/<[^>]+>/g, "")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/\n{3,}/g, "\n\n")
              .trim();
            console.log(`Extracted ${textContent.length} chars from docx: ${doc.name}`);
            userContent.push({
              type: "text",
              text: `[Document: ${doc.name}]\n${textContent}`,
            });
          }
        } catch (e) {
          console.error(`Failed to parse docx ${doc.name}:`, e);
        }
      } else {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("market-analysis-docs")
          .createSignedUrl(doc.filePath, 600);

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error(`Failed to create signed URL for ${doc.name}:`, signedUrlError);
          continue;
        }

        console.log(`Created signed URL for ${doc.name}`);

        if (mimeType.startsWith("image/")) {
          userContent.push({
            type: "image",
            source: { type: "url", url: signedUrlData.signedUrl },
          });
        } else {
          userContent.push({
            type: "document",
            source: { type: "url", url: signedUrlData.signedUrl },
          });
        }
      }
    }

    if (agentNotes && typeof agentNotes === "string" && agentNotes.trim()) {
      userContent.push({
        type: "text",
        text: `[Agent Notes — additional context from the buyer's agent]\n${agentNotes.trim()}`,
      });
    }

    // Set buyer names for the report salutation and owner fields
    if (buyerNames && Array.isArray(buyerNames) && buyerNames.length > 0) {
      const namesStr = buyerNames.join(" and ");
      userContent.push({
        type: "text",
        text: `This analysis is for buyer clients. Address the analysis to "${namesStr}" as the buyers. Use "Dear ${namesStr}," as the salutation. The owner1/owner2 fields in the JSON should be set to the buyer names: ${buyerNames.map((n: string, i: number) => `owner${i + 1}: "${n}"`).join(", ")}. The intro paragraph (narrative.intro) MUST be exactly this text (substitute the actual subject property address for [subject property address]): "Attached is the market analysis summary for [subject property address] based on the latest sales data for homes around the property you are interested in. We try to compare apples to apples as best we can matching up the style of home, square footage, number of bedrooms, baths, basement and garage stalls. Sometimes we have to step outside the true comparables to get a better sense but all in the all the analysis below will get us into the ball park as to the value of the home you are considering as compared to the activity of the neighborhood. The goal is to give you a clear, data-driven overview so you can make informed decisions about your property's value and your timing in today's market."`,
      });
    }

    userContent.push({ type: "text", text: BUYER_USER_PROMPT });

    console.log(`Sending ${userContent.length} content blocks to Claude for buyer market analysis`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: BUYER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
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
      console.error("Claude API error:", response.status, errorText);
      throw new Error(`Claude API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log("Claude usage:", JSON.stringify(data.usage));
    console.log("Claude stop_reason:", data.stop_reason);
    const textBlock = data.content?.find((b: any) => b.type === "text");
    const rawContent = textBlock?.text?.trim() || "";
    console.log("Claude response length:", rawContent.length);
    console.log("Claude response preview:", rawContent.substring(0, 800));

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

    // --- Clean up pricing: ensure lowPrice and highPrice are formatted ---
    if (analysis?.pricing) {
      const parseDollar = (v: string): number => {
        if (!v) return 0;
        return parseFloat(String(v).replace(/[$,]/g, "")) || 0;
      };
      const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

      const low = parseDollar(analysis.pricing.lowPrice);
      const high = parseDollar(analysis.pricing.highPrice);

      if (low > 0) analysis.pricing.lowPrice = fmt(low);
      if (high > 0) analysis.pricing.highPrice = fmt(high);

      console.log(`Purchase Range: ${analysis.pricing.lowPrice} - ${analysis.pricing.highPrice}`);
    }

    console.log("Extracted address:", analysis.property?.address);
    console.log("Extracted owner1:", analysis.property?.owner1);
    console.log("Closed comps count:", analysis.closedComps?.length);

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating buyer market analysis:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
