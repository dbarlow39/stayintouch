import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, aiGatewayErrorResponse } from "../_shared/mls-description.ts";

const PROMPT = `I am a seasoned real estate agent crafting my upcoming weekly newsletter specifically for my roster of existing home-selling clients in the Columbus, Ohio area. The primary objective of this newsletter is to keep them informed and empowered as they navigate the sales process. For a crucial section of this newsletter, I require two to three well-structured paragraphs (approximately 150-250 words) that delve into the current real estate market conditions. This analysis needs to be hyper-focused on how these conditions are directly influencing home sales and, by extension, my clients' selling experience. DO NOT CITE SOURCES IN THE PARAGRAPHS. Please consider and integrate the following elements:

* Key Market Indicators: Discuss how factors like current mortgage interest rates (fixed vs. adjustable), inflation rates, local unemployment figures, regional economic growth forecasts, and consumer confidence are shaping buyer behavior and affordability.

* Inventory Levels: Address the current supply-demand dynamics. Are we in a buyer's market, seller's market, or a balanced market? How has the number of active listings changed year-over-year or quarter-over-quarter?

* Pricing Trends: What are the prevailing trends for median home prices, average time on market, and list-to-sale price ratios in the Columbus, Ohio market? Are price reductions becoming more common, or are bidding wars still occurring in certain segments?

* Buyer Sentiment: How are buyers reacting to the current environment? Are they more cautious, or is there still strong demand for well-priced homes?

* Impact on Sellers: Directly elaborate on how these conditions translate to the seller's perspective. For example:

* Pricing Strategy: Does it necessitate a more competitive pricing strategy, or is there still room for appreciation?

* Marketing Efforts: Should sellers expect a longer marketing period, or is quick action still possible?

* Negotiation Power: How does the current market influence a seller's negotiation leverage regarding contingencies, repair requests, and closing costs?

* Inspection & Appraisal Considerations: Are appraisals coming in lower, and how can sellers prepare for potential appraisal gaps?

* Local Nuances/Micro-Markets: Briefly acknowledge if there are significant differences within our local market (e.g., impact on luxury homes vs. starter homes, or urban vs. suburban areas).

* Tone: The language should be professional, empathetic, informative, and reassuring. Avoid jargon where possible, or explain it clearly. The goal is to inform and empower, not to create anxiety or provide false hope.

* Actionable Takeaways (Implicit): While not explicitly stating "do this," the information should implicitly guide sellers on what to expect and potentially adapt their strategy.

* Do not use en dashes or em dashes.

* Write the article for human consumption at a 6th grade reading level. I need this content to be up-to-date and relevant to the most recent market data available (e.g., within the last 7 days). Please avoid generic statements and focus on providing specific, data-backed insights tailored to my selling clients. The final output should flow seamlessly and coherently.

Output only the paragraphs themselves. No headings, no preamble, no closing remarks, no quotes around the text.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await authenticate(req);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{ role: "user", content: PROMPT }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      if (resp.status === 429 || resp.status === 402) return aiGatewayErrorResponse(resp.status);
      return new Response(JSON.stringify({ error: `AI error: ${t.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const article = data?.choices?.[0]?.message?.content?.trim() || "";
    if (!article) throw new Error("Empty response from AI");

    return new Response(JSON.stringify({ article }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-market-article error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "Unauthorized" || msg === "Missing authorization" ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
