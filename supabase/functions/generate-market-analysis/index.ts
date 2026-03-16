import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a professional real estate analyst for The Barlow Group at SellFor1Percent.com. You use the Bullseye Pricing Model - always pricing at the TOP of the relevant $25,000 buyer search bracket, never the lower number within the same bracket.

You will receive up to 4 documents:

1. A CMA or Property Detail Report (CoreLogic, RPR, or similar)
2. A Residential Inspection Worksheet
3. A Zillow PDF screenshot
4. A walk-through summary or meeting transcript

Analyze all documents thoroughly. Return ONLY a valid JSON object - no preamble, no markdown code fences, no explanation. Raw JSON only.

BULLSEYE PRICING RULES:
- Buyer search brackets fall at every $25,000 increment
- Bracket tops: $375K, $400K, $425K, $450K, $475K, $500K, $525K, $550K
- To find the correct bracket: look at where the MAJORITY of closed comp sold prices fall, and use that bracket. Do not jump to a higher bracket just because one comp sold near a bracket boundary.
- Bullseye price = top of the correct bracket minus $100 (e.g. $424,900 for the $400K-$425K bracket)
- NEVER use the lower number within the same bracket as the Bullseye
- lowerBracketPrice = top of the bracket one step below minus $100 (e.g. $399,900)
- upperBracketPrice = top of the bracket one step above minus $100 (e.g. $449,900)
- EXAMPLE: If 3 comps sold at $405K, $416K, $427.5K - the majority are in the $400K-$425K bracket, so Bullseye = $424,900. Do NOT pick the $425K-$450K bracket.

ZESTIMATE FRAMING RULES:
- If Zestimate is HIGHER than Bullseye: explain that Zillow is counting basement beds/baths inflating the profile, algorithm cannot see upgrades or lot premiums, comp data is more precise
- If Zestimate is LOWER than Bullseye: position as hero moment - actual market data supports higher value
- If Zestimate is CLOSE to Bullseye: use as validation while noting algorithmic limitations

WRITING RULES:
- No em dashes - use a plain hyphen (-) instead
- Professional, warm, data-driven tone
- Address homeowners by FIRST NAMES ONLY (e.g. "Dear John and Jane,") - never use last names in the salutation or intro paragraph
- Never invent data - only use figures from the attached documents
- Features must be specific: brand names, ages, warranties where stated
- Review all property photos for value factors and incorporate observations into comp comparison bullets and price justification
- For the features array specifically: cross-reference ALL attached documents - the CMA, the Inspection Worksheet, AND the walk-through summary - to build the most complete and specific feature list possible. Do not rely on any single document alone.
- SQUARE FOOTAGE ACCURACY: CMA reports (CoreLogic, RPR) sometimes copy the total building square footage into the "Basement Sq Feet" field incorrectly. Never trust the CMA basement sq ft field if it matches or is close to the above-grade sq ft. Always cross-reference the walk-through summary and inspection worksheet to find the actual finished basement square footage. The finished basement sq ft will always be SMALLER than the above-grade sq ft. If the CMA shows a "Basement Sq Feet" value that equals the above-grade sq ft, it is wrong - ignore it and use the figure from the walk-through or inspection documents instead.
- TOTAL FINISHED SQ FT: Always calculate totalFinishedSqFt as the above-grade sq ft PLUS the finished basement sq ft. Never use a single number for both.`;

const USER_PROMPT = `FEATURES WRITING RULES - apply these when populating the features array:

- Write each bullet as a complete, specific sentence - not a fragment
- Combine related items into single bullets (e.g. combine all kitchen appliances into one bullet, combine all garage features into one bullet)
- Always include brand names, ages, and warranty details exactly as stated in the documents (e.g. "Cambria quartz countertops with lifetime warranty", "Jenn-Weld double-hung vinyl clad insulated windows")
- Always note inclusion/exclusion status where stated (e.g. "refrigerator stays", "washer and dryer do not convey", "blinds stay, curtain rods stay, curtains negotiable")
- Note finished basement square footage and total finished living area
- Note roof type, age status, and layer count
- Note furnace type, AC type, hot water type, and any sump pump
- Note window brand, style, and insulation
- Note lot features such as wooded backing, patio, porch, landscaping
- Aim for 12-15 bullets minimum
- Never list a feature without its relevant detail - "fireplace" alone is not acceptable; "wood-burning stone fireplace with no gas option" is correct

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
    "listHigh": "",
    "sqFtAvg": "",
    "domAvg": "",
    "soldToListRatio": ""
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
    "bullseyePrice": "",
    "bullseyeBracketLow": "",
    "bullseyeBracketHigh": "",
    "lowerBracketPrice": "",
    "lowerBracketLow": "",
    "lowerBracketHigh": "",
    "upperBracketPrice": "",
    "upperBracketLow": "",
    "upperBracketHigh": ""
  },
  "narrative": {
    "intro": "Thank you for the time you spent with me walking through your home and sharing your goals for this next chapter. It is clear you have taken exceptional pride in maintaining and upgrading your property, and I am confident we can help you accomplish a successful sale. Attached is the market analysis summary based on the latest data for your home. The goal is to give you a clear, data-driven overview so you can make informed decisions about your property's value and your timing in today's market.",
    "taxNote": "",
    "compComparison": [""],
    "communityParagraph": "",
    "marketConditions": "",
    "zillowWordOn": "",
    "zillowNoteOn": "",
    "bullseyeExplain": "",
    "bracketAnalysis": "",
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
    const { documents } = await req.json();

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
            // Extract text preserving paragraph breaks for better readability
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
              text: `[Document: ${doc.name}]\n${textContent}`
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
            source: { type: "url", url: signedUrlData.signedUrl }
          });
        } else {
          userContent.push({
            type: "document",
            source: { type: "url", url: signedUrlData.signedUrl }
          });
        }
      }
    }

    userContent.push({ type: "text", text: USER_PROMPT });

    console.log(`Sending ${userContent.length} content blocks to Claude for market analysis`);

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
        system: SYSTEM_PROMPT,
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
    
    // Log key extracted fields to verify data
    console.log("Extracted address:", analysis.property?.address);
    console.log("Extracted owner1:", analysis.property?.owner1);
    console.log("Closed comps count:", analysis.closedComps?.length);
    console.log("Bullseye price:", analysis.pricing?.bullseyePrice);

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
