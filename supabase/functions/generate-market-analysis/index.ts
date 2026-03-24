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
- EXAMPLE: If 3 comps sold at $405K, $416K, $427.5K - the majority are in the $400K-$425K bracket, so Bullseye = $424,900. Do NOT pick the $425K-$450K bracket.
- lowerBracketPrice and upperBracketPrice will be calculated automatically by the system — you may leave them as empty strings or provide rough values, they will be overridden.

ZESTIMATE FRAMING RULES:

SCENARIO A - Zestimate is HIGHER than Bullseye price:
The zillowWordOn field must be a full paragraph of 4-5 sentences that does all of the following:
1. Open by acknowledging the Zestimate by its exact dollar amount and saying it is understandable if that number caught their attention
2. Explain exactly WHY it is higher - Zillow has counted the finished basement bedroom and bathroom, classifying the home as a larger bed/bath count than the above-grade reality. State the inflated bed/bath/sqft profile Zillow is using.
3. Explain that this is not how buyers, appraisers, or MLS data classify above-grade square footage, and it is not how the market values the home
4. State that the algorithm cannot see the difference between above-grade living space and finished basement space, and has no knowledge of specific upgrades (name them: the Cambria quartz, the custom built-ins, the wooded backing, etc.)
5. Close by stating that the actual closed sales in the subdivision - real transactions with real buyers - tell a more precise and reliable story
Never write a generic sentence like "Zillow provides a useful automated estimate." That is not acceptable. The paragraph must specifically explain the basement bed/bath inflation issue.

SCENARIO B - Zestimate is LOWER than Bullseye price:
The zillowWordOn field must be a full paragraph of 3-4 sentences that:
1. Notes the Zestimate by its exact dollar amount
2. Explains that the actual market data - using real closed comp sales - shows the home supports a higher value
3. Names specific features and upgrades that Zillow's algorithm cannot account for
4. Positions this as validation that the Bullseye price is well-supported

SCENARIO C - Zestimate is CLOSE to Bullseye price (within $10,000):
The zillowWordOn field must be a full paragraph of 3-4 sentences that:
1. Notes the Zestimate is close to the data-driven Bullseye price
2. Uses this as validation - when both the algorithm and the comp analysis agree, it gives high confidence
3. Still notes the algorithmic limitations so the seller understands why agent-guided analysis is superior

FOR ALL SCENARIOS - the zillowNoteOn field must always be exactly this sentence, word for word:
"A note on online valuation tools: Zillow's Zestimate and similar automated valuation models rely on algorithm-driven estimates that often lag actual market conditions and cannot account for your home's specific upgrades, custom finishes, or location premium within the subdivision. The data-driven, agent-guided comparable analysis presented here reflects what real buyers are actually paying in your specific market today."

WRITING RULES:
- No em dashes - use a plain hyphen (-) instead
- Professional, warm, data-driven tone
- Address homeowners by FIRST NAMES ONLY (e.g. "Dear John and Jane,") - never use last names in the salutation or intro paragraph
- Never invent data - only use figures from the attached documents
- Features must be specific: brand names, ages, warranties where stated
- Review all property photos for value factors and incorporate observations into comp comparison bullets and price justification
- For the features array specifically: cross-reference ALL attached documents - the CMA, the Inspection Worksheet, AND the walk-through summary - to build the most complete and specific feature list possible. Do not rely on any single document alone.
- SQUARE FOOTAGE ACCURACY: CMA reports (CoreLogic, RPR) sometimes copy the total building square footage into the "Basement Sq Feet" field incorrectly. Never trust the CMA basement sq ft field if it matches or is close to the above-grade sq ft. Always cross-reference the walk-through summary and inspection worksheet to find the actual finished basement square footage. The finished basement sq ft will always be SMALLER than the above-grade sq ft. If the CMA shows a "Basement Sq Feet" value that equals the above-grade sq ft, it is wrong - ignore it and use the figure from the walk-through or inspection documents instead.
- TOTAL FINISHED SQ FT: Always calculate totalFinishedSqFt as the above-grade sq ft PLUS the finished basement sq ft. Never use a single number for both.
- MARKET CONDITIONS NARRATIVE: The marketConditions field must be a data-driven paragraph that references the actual comp data, not generic market commentary. It must include ALL of the following specific elements:
  1. Name the local area (city/neighborhood) and describe the general market trend (inventory, buyer demand)
  2. Reference each closed comp's days on market individually by name - do not average them or speak generally. For example: "one home sold in 4 days, one took 64 days after a price reduction, and one lingered 378 days." This contrast tells the seller exactly what buyer behavior looks like in their market.
  3. Name any active competitor by address and list price, and note how long it has been sitting
  4. Reference the 2-year appreciation percentage and the CoreLogic Q1 forward forecast dollar figure
  5. Close with a statement about why Day 1 pricing precision matters given this specific data - tie the slow comps to overpricing risk
  The paragraph must be specific enough that it could only apply to this property in this market. Generic statements like "most properties sell at or above 99% of list price" are not acceptable unless that figure came directly from the comp data.
- MARKET CONDITIONS LENGTH: The marketConditions paragraph should be 4-6 sentences minimum. It must reference specific addresses, specific DOM numbers, and specific dollar figures from the comps. Never write fewer than 4 sentences for this field.
- TAX NOTE: The taxNote field must follow this exact template, substituting the property's actual county market value: "A note on the county's assessed market value of [county market value]: tax assessments in Ohio typically lag actual market conditions by two to three years and should not be used as a pricing benchmark. The comparable sales data below is a far more accurate reflection of current buyer demand." Do NOT mention the tax amount, effective rate, or any other tax figures. Only reference the county assessed market value.
- COMP COMPARISON BULLETS: The compComparison array must NOT be a list of comp descriptions. Each bullet must be written from the subject property's perspective, comparing it TO the comps - not describing the comps individually. The bullets must follow this exact structure and order:
  Bullet 1 - RELEVANCE: State what makes the comps valid benchmarks. Example: all are Ranch-style homes in the same subdivision and school district.
  Bullet 2 - SQUARE FOOTAGE: Acknowledge the subject property's above-grade sq ft is smaller than the comps, then immediately explain how the finished basement brings the total finished living area much closer to the comp range. Give specific numbers. Never just say the home is smaller without explaining the basement contribution.
  Bullet 3 - AGE AND QUALITY: Note the subject's build year relative to the comps. Then explain how specific upgrades (kitchen, floors, custom features, garage) justify competing with or exceeding newer builds. Be specific - name the upgrades.
  Bullet 4 - FASTEST COMP AND CLOSEST MATCH: Name the fastest-selling comp with its DOM and sold price. Then name the most similar comp to the subject (same street, same bed/bath count) with its sold price, build year, and what makes it different from the subject.
  Bullet 5 - ACTIVE COMPETITION: Name the active listing by address with its list price, bed/bath count, sq ft, and build year. Explain what the subject property offers that differentiates it.
  Each bullet must be 2-3 sentences and reference specific addresses, prices, square footage, and dates from the documents. Never write a generic bullet that could apply to any property.
- BULLSEYE NARRATIVE PARAGRAPHS: The three Bullseye narrative fields must be written as follows:
  bullseyeExplain - A paragraph of 3-4 sentences that:
  1. Introduces the Bullseye Pricing Model principle: pricing precisely at true market value on Day 1 generates maximum buyer interest, creates conditions for multiple offers, and consistently produces the highest net sale price
  2. Introduces the Buyer Bracket concept: real estate portals ask buyers to select a price range using dropdown menus at every $25,000 increment, and the price point determines which bracket the home appears in and how many buyers see it
  3. States that this is what we call Buyer Brackets and that the price point determines which bracket the home appears in and how many buyers see it
  Never write a generic paragraph. This must explain both the Bullseye concept AND the Buyer Bracket mechanism.
  bracketAnalysis - A paragraph of 4-5 sentences that:
  1. Names the three specific dollar brackets relevant to THIS property (e.g. $375,000 to $400,000, $400,000 to $425,000, and $425,000 to $450,000)
  2. Explains that a home priced at the lower price within the Bullseye bracket and a home priced at the Bullseye price appear in the exact same bracket and are seen by the exact same pool of buyers - so there is no benefit to pricing lower within that bracket
  3. States that the Bullseye sits at the top of the bracket, capturing every buyer in that range while maximizing net proceeds
  4. Explains what the lower bracket price does (drops a bracket, more buyers, faster but gives up value unnecessarily)
  5. Explains what the upper bracket price does (moves into a higher, smaller bracket with fewer buyers, longer DOM, higher risk of price reduction)
  Use the actual bracket dollar figures from the pricing JSON fields. Never write generic bracket descriptions.
  priceJustification - This paragraph must NEVER repeat the bracket concept - that was already explained in bracketAnalysis. This paragraph is purely a data-driven argument for why the Bullseye price is correct for this specific property. It must be exactly 6 sentences following this structure:
  Sentence 1: "Our recommended Bullseye price of $[PRICE] is grounded in what the market evidence clearly supports."
  Sentence 2: "Priced at the top of the $[LOW] to $[HIGH] buyer bracket, it reaches every buyer searching up to $[HIGH] while maximizing your net proceeds within that bracket."
  Sentence 3: Name the closest sold comparable as "Your closest true comparable, [ADDRESS], a [BEDS]-bedroom, [BATHS]-bath [STYLE] [on your own street if applicable], sold for $[PRICE] in [MONTH YEAR] but was [ONE KEY DIFFERENCE with a specific number, e.g. 'a newer 2020 build with 449 more above-grade square feet']." Include the specific numeric difference - never say "more square footage" without the number.
  Sentence 4: Make the upgrade argument starting with "Your" (not "Your home's"). List 4-6 specific named upgrades (e.g. Cambria quartz kitchen, solid hardwood floors, custom built-ins, wood-burning fireplace, finished basement, wooded backing) and end with "all justify a meaningful premium over that sale."
  Sentence 5: Start with "At the same time, $[BULLSEYE PRICE] matches the active $[LIST PRICE] listing at [ADDRESS] for price, but your [2-3 specific advantages] give buyers a clear reason to prefer yours."
  Sentence 6: "This is the Bullseye: the highest price within the bracket that still attracts the full buyer pool, appraises cleanly, and gives buyers the confidence to move quickly."
  RULES:
  - Follow the sentence templates above closely - they define the tone and structure
  - Every sentence must contain at least one specific address, dollar figure, or named feature from the documents
  - Never use "Your home's" - use "Your" directly (e.g. "Your Cambria quartz kitchen" not "Your home's Cambria quartz countertops")
  - Never use the phrase "comparable sales data" or "market range" as a substitute for naming actual comps
  - Never use "comp sale" - say "that sale" instead
  - Never use "The active competitor at" - use "At the same time, $X matches the active $Y listing at [address]"
  - Never restate the bracket concept - that belongs in bracketAnalysis only
  - The final sentence must always start with "This is the Bullseye:"
  - Never write fewer than 6 sentences`;

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

    if (agentNotes && typeof agentNotes === "string" && agentNotes.trim()) {
      userContent.push({
        type: "text",
        text: `[Agent Notes — additional context and instructions from the listing agent]\n${agentNotes.trim()}`
      });
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

    // --- Deterministic Bullseye +/- pricing recalculation ---
    if (analysis?.pricing?.bullseyePrice) {
      const parseDollar = (v: string): number => {
        if (!v) return 0;
        return parseFloat(String(v).replace(/[$,]/g, "")) || 0;
      };

      const bullseye = parseDollar(analysis.pricing.bullseyePrice);

      if (bullseye > 0) {
        // Percentage tiers for plus-up / plus-down
        const getAdjustmentPct = (price: number): number => {
          if (price < 100000) return 0.10;
          if (price < 200000) return 0.125;
          if (price < 300000) return 0.125;
          if (price < 400000) return 0.125;
          if (price < 500000) return 0.10;
          if (price < 600000) return 0.10;
          if (price < 700000) return 0.10;
          if (price < 800000) return 0.10;
          if (price < 900000) return 0.10;
          if (price < 1000000) return 0.10;
          return 0.25; // $1M+
        };

        // Bracket width tiers for rounding
        const getBracketWidth = (price: number): number => {
          if (price < 200000) return 10000;
          if (price < 500000) return 25000;
          if (price < 1000000) return 50000;
          return 250000;
        };

        // Round to nearest bracket top, then subtract $100
        const roundToBracketPrice = (rawPrice: number): { price: number; low: number; high: number } => {
          const width = getBracketWidth(rawPrice);
          const bracketTop = Math.round(rawPrice / width) * width;
          return {
            price: bracketTop - 100,
            low: bracketTop - width,
            high: bracketTop,
          };
        };

        const pct = getAdjustmentPct(bullseye);
        const upperRaw = bullseye * (1 + pct);
        const lowerRaw = bullseye * (1 - pct);

        const upper = roundToBracketPrice(upperRaw);
        const lower = roundToBracketPrice(lowerRaw);

        // Also recalculate the bullseye bracket labels
        const bWidth = getBracketWidth(bullseye);
        const bTop = Math.ceil(bullseye / bWidth) * bWidth;
        const bLow = bTop - bWidth;

        const fmt = (n: number) => `$${n.toLocaleString("en-US")}`;

        analysis.pricing.upperBracketPrice = fmt(upper.price);
        analysis.pricing.upperBracketLow = fmt(upper.low);
        analysis.pricing.upperBracketHigh = fmt(upper.high);
        analysis.pricing.lowerBracketPrice = fmt(lower.price);
        analysis.pricing.lowerBracketLow = fmt(lower.low);
        analysis.pricing.lowerBracketHigh = fmt(lower.high);
        analysis.pricing.bullseyeBracketLow = fmt(bLow);
        analysis.pricing.bullseyeBracketHigh = fmt(bTop);

        console.log(`Bullseye recalc: ${fmt(bullseye)} ±${(pct * 100)}% → Lower: ${fmt(lower.price)}, Upper: ${fmt(upper.price)}`);
      }
    }
    // --- End pricing recalculation ---

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
