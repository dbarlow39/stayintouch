import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { imageData } = await req.json();
    if (!imageData) return new Response(JSON.stringify({ error: "No image data provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You are a handwriting recognition assistant. Your task is to read handwritten text from images and transcribe it accurately.\n\nRules:\n- Only output the transcribed text, nothing else\n- Combine all lines of handwriting into a SINGLE LINE of text\n- Do NOT preserve line breaks\n- If you cannot read certain words, make your best guess\n- If the image appears blank or has no readable text, respond with an empty string\n- Do not add any commentary, explanations, or formatting` },
          { role: "user", content: [{ type: "text", text: "Please read and transcribe the handwritten text in this image:" }, { type: "image_url", image_url: { url: imageData } }] }
        ],
        max_tokens: 1000
      }),
    });
    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI Gateway error: ${response.status}`);
    }
    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content?.trim() || "";
    return new Response(JSON.stringify({ text: extractedText }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process handwriting";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
