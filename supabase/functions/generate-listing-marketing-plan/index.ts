import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a top-producing real estate listing agent building a complete, execution-ready marketing plan for a specific new listing.

Output rules:
- Return ONE cohesive Markdown document.
- Use these H2 sections IN THIS EXACT ORDER, with these exact titles:
  ## Neighborhood Highlights
  ## Demographics
  ## Ideal Buyer
  ## Lifestyle If I Lived Here
  ## Biggest Cons of the Neighborhood
  ## Objection Handlers
  ## Full Marketing Plan
  ## Neighborhood Farming Plan
  ## Execution List
- Under "Objection Handlers", pair each con from the previous section 1:1.
- Under "Execution List", include two subsections: "### Content & Reels Ideas" (with at least one reel per objection above) and "### Demographic Targeting Plan".
- Be concrete and local. Use bullet points, short paragraphs, and specific numbers where reasonable.
- Do not invent verified statistics you cannot reasonably infer. When generalizing, say so plainly.
- No preamble, no closing pleasantries. Start with the first H2.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("address, city, state, zip")
      .eq("id", leadId)
      .single();
    if (leadErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullAddress = [lead.address, lead.city, lead.state, lead.zip]
      .filter(Boolean)
      .join(", ");
    if (!fullAddress) {
      return new Response(JSON.stringify({ error: "Lead has no address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `I just took a new listing at ${fullAddress}. I want you to help me build a complete marketing plan. Work through all of the following:

Give me the highlights of the neighborhood.

Pull demographic data from this area.

Identify the ideal buyer I should be marketing to.

If I lived here, what would my lifestyle look like?

Identify the biggest cons of living in this neighborhood.

Give me an objection handler for each one.

Build a full marketing plan for the listing. The goal is to generate as many offers as possible.

Include a neighborhood farming plan for this specific listing.

Then turn the plan into an execution list: content/reels ideas (including reels that handle objections from the cons above) and a demographic targeting plan for reaching the right buyer.`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: `AI request failed (${aiRes.status})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const markdown = data?.choices?.[0]?.message?.content?.trim();
    if (!markdown) {
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ markdown, address: fullAddress }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-listing-marketing-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
