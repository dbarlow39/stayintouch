// Tweak an existing MLS description using Anthropic Claude.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders } from "../_shared/mls-description.ts";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

const TWEAK_SYSTEM_PROMPT = `You are an expert MLS copywriter. The user will give you an existing MLS description and an instruction for how to revise it (add something, remove something, change tone, etc.).

Apply the instruction while preserving the storytelling tone and emotional resonance of the original.

STRICT RULES:
- Do NOT use em dashes (—). Use commas, periods, or parentheses instead.
- Keep the final description under 1000 characters INCLUDING spaces.
- Output only the revised MLS description text. No headings, no preamble, no quotes around it, no explanations.`;

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { currentText, instruction } = await req.json();
    if (!currentText || !instruction) throw new Error("currentText and instruction are required");
    await authenticate(req);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: TWEAK_SYSTEM_PROMPT,
        stream: true,
        messages: [{ role: "user", content: `CURRENT MLS DESCRIPTION:\n${currentText}\n\nINSTRUCTION:\n${instruction}\n\nReturn the revised MLS description now.` }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text();
      console.error("Anthropic error:", upstream.status, t);
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
  } catch (e) {
    console.error("tweak-mls-description-claude error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
