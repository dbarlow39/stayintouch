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
- Bullseye price = top of the target bracket minus $100 (e.g. $424,900 for the $400K-$425K bracket)
- NEVER use the lower number within the same bracket as the Bullseye
- lowerBracketPrice = top of the bracket one step below minus $100
- upperBracketPrice = top of the bracket one step above minus $100
- Common bracket tops: $375K, $400K, $425K, $450K, $475K, $500K, $525K, $550K

ZESTIMATE FRAMING RULES:
- If Zestimate is HIGHER than Bullseye: explain that Zillow is counting basement beds/baths inflating the profile, algorithm cannot see upgrades or lot premiums, comp data is more precise
- If Zestimate is LOWER than Bullseye: position as hero moment - actual market data supports higher value
- If Zestimate is CLOSE to Bullseye: use as validation while noting algorithmic limitations

WRITING RULES:
- No em dashes - use a plain hyphen (-) instead
- Professional, warm, data-driven tone
- Address homeowners by first names extracted from documents
- Never invent data - only use figures from the attached documents
- Features must be specific: brand names, ages, warranties where stated
- Review all property photos for value factors and incorporate observations into comp comparison bullets and price justification`;

const USER_PROMPT = `Analyze the attached documents and return your analysis as a JSON object matching this exact schema:

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
    "intro": "",
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
            const textContent = docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
        "anthropic-version": "2024-10-22",
        "anthropic-beta": "pdfs-2024-09-25",
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
