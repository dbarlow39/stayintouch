import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, data } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    let prompt = "";

    if (type === "bullseye") {
      prompt = `Generate a professional real estate pricing strategy graphic with the following specifications:

LAYOUT: A clean, professional infographic on a white background, sized for a document (roughly 460x673 pixels aspect ratio).

TOP SECTION - BULLSEYE TARGET:
- Show the property address "${data.address}" at the top with "Sell for 1 Percent REALTORS" branding
- Draw concentric target rings: outer red / white gap / middle red / white gap / center red bullseye
- Three price labels on the graphic (no leader lines, no hash marks):
  - Outer ring upper-right: ${data.upperBracketPrice} 
  - Outer ring lower-left: ${data.lowerBracketPrice}
  - Center bullseye: ${data.bullseyePrice} (bold, larger than other labels) with "BULLSEYE" subtitle beneath it
- Y-axis label: "Asking Price"
- X-axis label: "Days on Market"
- Use dark scarlet/red (#CC0000) for the target rings

BOTTOM SECTION - BUYER BRACKET TABLE:
Header: "BUYER BRACKET STRATEGY | How Buyers Search Online" in white text on dark scarlet (#CC0000) background
Three rows with alternating white and light red (#FDECEA) backgrounds:
1. ${data.lowerBracketPrice} | ${data.lowerBracket} | "Maximum buyer pool. Likely to generate multiple offers and bidding competition quickly. Best choice if speed is the priority."
2. ${data.bullseyePrice} ★ BULLSEYE | ${data.bullseyeBracket} | "Top of the bracket. Reaches every buyer searching up to the bracket max. Strong Day 1 showings with maximum net result. Best overall strategy." (highlight this row)
3. ${data.upperBracketPrice} | ${data.upperBracket} | "Enters a new, smaller buyer bracket. Fewer showings, longer days on market, and likely a price reduction will be needed. Highest risk of stalling."

STYLE: Professional, clean, real estate marketing quality. Use red/scarlet color scheme. No blue colors. Text must be clearly legible.`;
    } else if (type === "zillow") {
      prompt = `Generate a Zillow Zestimate card graphic with these specifications:

SIZE: Roughly 370x536 pixels aspect ratio, professional quality.

LAYOUT (top to bottom):
1. HEADER: Zillow blue (#006AFF) background with white "Zestimate" badge/logo text
2. Property address: "${data.address}" in dark text on white
3. Zestimate amount: "${data.zestimate}" in large bold dark text
4. "Updated ${data.updatedDate}" and "${data.appreciationNote}" in smaller gray text
5. THREE INFO BOXES in a row:
   - "Zestimate: ${data.zestimate}"
   - "Est. Sales Range: ${data.estimatedSalesRange}"  
   - "Rent Zestimate: ${data.rentZestimate}"
6. A horizontal range slider bar showing where the Zestimate falls in the range
7. STAT ROWS:
   - Price/sq ft: ${data.pricePerSqFt}
   - Beds/Baths: ${data.bedsBaths}
   - Property Type: ${data.propertyType}
   - Year Built: ${data.yearBuilt}
8. Fine print disclaimer text at bottom
9. IMPORTANT CONTEXT BOX: Amber/gold (#D4A017) left border, light yellow (#FFFDE7) background, containing: "${data.importantContext}"

STYLE: Match Zillow's actual card design aesthetic. Use Zillow blue (#006AFF) for headers and accents. This is the ONLY place blue is allowed. Clean, modern, data-card style.`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid graphic type. Use 'bullseye' or 'zillow'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          { role: "user", content: prompt }
        ],
        modalities: ["image", "text"],
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
      console.error("AI image gateway error:", response.status, errorText);
      throw new Error(`AI image gateway error: ${response.status}`);
    }

    const result = await response.json();
    const imageUrl = result.choices?.[0]?.message?.images?.[0]?.image_url?.url || "";

    if (!imageUrl) {
      throw new Error("No image was generated");
    }

    return new Response(
      JSON.stringify({ imageUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating graphic:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
