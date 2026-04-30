// Suggest "Points of interest & emphasis" for the MLS description
// by extracting concise bullets from the residential work sheet's AI Summary.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders } from "../_shared/mls-description.ts";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPT = `You read a real-estate agent's walk-through AI Summary of a property and pull out the most marketable points of interest and selling points to emphasize in an MLS description.

Output rules:
- Return 5 to 8 short bullets, one per line.
- Start each line with a hyphen and a space ("- ").
- Each bullet is a single concise phrase (max ~12 words). No full sentences with periods.
- Focus on features that buyers care about: recent updates/renovations, special rooms, lot/yard, location perks, condition highlights, distinctive architecture, mechanicals, storage, views, etc.
- Do NOT mention price, the agent, the seller, or anything personal/negative.
- Do NOT use em dashes.
- Output ONLY the bullets. No headings, no preamble, no explanation.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { aiSummary } = await req.json();
    if (!aiSummary || typeof aiSummary !== "string" || aiSummary.trim().length < 20) {
      throw new Error("aiSummary is required");
    }
    await authenticate(req);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `WALK-THROUGH AI SUMMARY:\n\n${aiSummary}\n\nReturn the bullet list of points of interest now.`,
          },
        ],
      }),
    });

    if (!upstream.ok) {
      const t = await upstream.text();
      console.error("Anthropic error:", upstream.status, t);
      return new Response(JSON.stringify({ error: `Claude API error: ${t.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await upstream.json();
    const text: string =
      data?.content?.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("").trim() || "";

    return new Response(JSON.stringify({ points: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-mls-points error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
