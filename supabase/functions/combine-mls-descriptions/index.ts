// Combines the Gemini + Claude MLS descriptions into a single best version.
// Routes to the chosen model: "gemini" -> Lovable AI gateway / Gemini 2.5 Pro,
// "claude" -> Anthropic Claude Sonnet 4.5. Streams as OpenAI-compatible SSE.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, aiGatewayErrorResponse } from "../_shared/mls-description.ts";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

const COMBINE_SYSTEM_PROMPT = `You are a master MLS copywriter. The user will give you TWO MLS descriptions written for the same property by two different AI models. Your job is to merge the strongest elements of both into ONE cohesive, polished MLS description.

Pull the best phrases, the most evocative imagery, the strongest opening hook, and the most compelling call to action from either source. Where they cover the same feature, pick the better wording. Where one mentions a feature the other misses, weave it in if it strengthens the story. The result must read as a single voice, not a stitched-together patchwork.

STRICT RULES:
- Do NOT use em dashes (—). Use commas, periods, or parentheses instead.
- Keep the final description under 1000 characters INCLUDING spaces. This is a hard limit.
- Do not use clichés like "must see" or "won't last long".
- ALWAYS end with a clear call-to-action sentence directing the reader to call their agent to schedule a personal showing (e.g. "Call your agent today to schedule your personal showing." or "Don't wait, call your agent now to book a private tour."). Vary the wording but the intent must always be: contact the agent and book a showing.
- Output only the combined MLS description text. No headings, no preamble, no quotes around it, no explanations.`;

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

async function streamGemini(userText: string): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "system", content: COMBINE_SYSTEM_PROMPT }, { role: "user", content: userText }],
      stream: true,
    }),
  });
  if (!response.ok) {
    console.error("Gemini combine error:", response.status, await response.text());
    return aiGatewayErrorResponse(response.status);
  }
  return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
}

async function streamClaude(userText: string): Promise<Response> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: COMBINE_SYSTEM_PROMPT,
      stream: true,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text();
    console.error("Claude combine error:", upstream.status, t);
    return new Response(JSON.stringify({ error: `Claude API error: ${t.slice(0, 300)}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trimEnd();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6).trim());
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
                controller.enqueue(encoder.encode(sseChunk(evt.delta.text)));
              }
            } catch (_) {}
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { gemini, claude, model, notes } = await req.json();
    if (!gemini && !claude) throw new Error("At least one of gemini or claude descriptions is required");
    if (model !== "gemini" && model !== "claude") throw new Error("model must be 'gemini' or 'claude'");
    await authenticate(req);

    const notesBlock = notes && String(notes).trim()
      ? `\n\nAGENT'S POINTS OF INTEREST & EMPHASIS (HIGH PRIORITY — make sure these are reflected in the final version):\n${String(notes).trim()}\n`
      : "";

    const userText = `DESCRIPTION A (Gemini 2.5 Pro):\n${gemini || "(not provided)"}\n\nDESCRIPTION B (Claude Sonnet 4.5):\n${claude || "(not provided)"}${notesBlock}\n\nMerge these into one polished MLS description following the rules. Output only the final description.`;

    return model === "gemini" ? await streamGemini(userText) : await streamClaude(userText);
  } catch (e) {
    console.error("combine-mls-descriptions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
