// Generates an MLS description using Anthropic Claude.
// Streams responses in OpenAI-compatible SSE chunks so the same frontend parser works.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildWorkSheetContext, corsHeaders, MLS_SYSTEM_PROMPT } from "../_shared/mls-description.ts";

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";

async function fetchImageAsBase64(url: string): Promise<{ media_type: string; data: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { media_type: ct.split(";")[0], data: btoa(bin) };
  } catch (_) {
    return null;
  }
}

function sseChunk(text: string): string {
  const payload = { choices: [{ delta: { content: text } }] };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function streamClaude(req: Request, body: any): Promise<Response> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!upstream.ok || !upstream.body) {
    const t = await upstream.text();
    console.error("Anthropic error:", upstream.status, t);
    if (upstream.status === 429) return new Response(JSON.stringify({ error: "Claude rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: `Claude API error: ${t.slice(0, 300)}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Translate Anthropic SSE -> OpenAI-compatible SSE
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
            const json = line.slice(6).trim();
            if (!json) continue;
            try {
              const evt = JSON.parse(json);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
                controller.enqueue(encoder.encode(sseChunk(evt.delta.text)));
              } else if (evt.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch (_) { /* ignore parse errors on partials */ }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        console.error("Claude stream relay error:", e);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId is required");

    const { supabase, user } = await authenticate(req);
    const { factsText, allPhotos } = await buildWorkSheetContext(supabase, user, leadId);

    // Fetch images as base64 (Anthropic requires inline base64 or URL source).
    // Cap at 20 to control payload size + cost on Claude.
    const cappedPhotos = allPhotos.slice(0, 20);
    const imageBlocks: any[] = [];
    for (const url of cappedPhotos) {
      const img = await fetchImageAsBase64(url);
      if (img) imageBlocks.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
    }

    const content = [...imageBlocks, { type: "text", text: factsText }];

    return await streamClaude(req, {
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: MLS_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
  } catch (e) {
    console.error("generate-mls-description-claude error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
