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

* Write the article for human consumption at a 6th grade reading level. Avoid generic statements and focus on insights tailored to my selling clients. The final output should flow seamlessly and coherently.

* CRITICAL DATA RULE: Use ONLY the figures supplied to you below. Do not invent, estimate, or recall any other statistic. If a figure is not supplied, discuss that topic qualitatively with no numbers. Never say you lack current data and never refuse; simply write the article from what is supplied.

Output only the paragraphs themselves. No headings, no preamble, no closing remarks, no quotes around the text.`;

function buildDataBlock(m: Record<string, unknown> | null): string {
  if (!m || typeof m !== "object") return "";
  const label: Record<string, string> = {
    week_of: "Week of",
    active_homes: "Active homes on the market",
    active_homes_last_week: "Active homes last week",
    inventory_change: "Change in active listings vs last week",
    market_avg_dom: "Average days on market",
    price_trend: "Price trend",
    price_reductions: "Homes with price reductions this week",
    new_listings: "New listings this week",
    closed_deals: "Homes closed this week",
    in_contracts: "Homes that went under contract this week",
    mortgage_rate_30yr: "30 year fixed mortgage rate (%)",
    mortgage_rate_30yr_week_ago: "30 year fixed rate one week ago (%)",
    mortgage_rate_30yr_year_ago: "30 year fixed rate one year ago (%)",
    mortgage_rate_15yr: "15 year fixed mortgage rate (%)",
    mortgage_rate_15yr_week_ago: "15 year fixed rate one week ago (%)",
    mortgage_rate_15yr_year_ago: "15 year fixed rate one year ago (%)",
    freddie_mac_summary: "Freddie Mac summary",
  };
  const lines: string[] = [];
  for (const [key, name] of Object.entries(label)) {
    const v = (m as Record<string, unknown>)[key];
    if (v === null || v === undefined || v === "") continue;
    lines.push(`- ${name}: ${v}`);
  }
  if (!lines.length) return "";
  return `\n\nTHIS WEEK'S VERIFIED COLUMBUS, OHIO MARKET DATA (supplied by the agent, treat as accurate and current):\n${lines.join("\n")}`;
}

async function fetchLiveContext(): Promise<string> {
  const key = Deno.env.get("PERPLEXITY_API_KEY");
  if (!key) return "";
  try {
    const r = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "sonar-pro",
        search_recency_filter: "week",
        messages: [
          { role: "system", content: "Be factual and concise. No citations markup, plain sentences only." },
          {
            role: "user",
            content:
              "In 8 short bullet points, summarize this week's real estate and economic conditions affecting home sellers in the Columbus, Ohio metro: mortgage rate direction, inflation, local job market, buyer demand and sentiment, inventory, and any notable local housing news. Only include facts you can verify from recent sources.",
          },
        ],
      }),
    });
    if (!r.ok) {
      console.error("Perplexity error:", r.status, (await r.text()).slice(0, 300));
      return "";
    }
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content?.trim() || "";
    return txt
      ? `\n\nCURRENT MARKET CONTEXT FROM LIVE WEB SEARCH (background only, use for narrative color; the agent's figures above win any conflict):\n${txt}`
      : "";
  } catch (e) {
    console.error("Perplexity fetch failed:", e);
    return "";
  }
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await authenticate(req);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let emphasis = "";
    try {
      const body = await req.json();
      emphasis = typeof body?.emphasis === "string" ? body.emphasis.trim() : "";
    } catch {
      // no body is fine
    }

    const finalPrompt = emphasis
      ? `${PROMPT}\n\nIMPORTANT — weave this week's point of emphasis naturally into the article (do not quote it verbatim, integrate the idea): ${emphasis}`
      : PROMPT;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [{ role: "user", content: finalPrompt }],
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
