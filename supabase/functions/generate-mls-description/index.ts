import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, buildWorkSheetContext, corsHeaders, MLS_SYSTEM_PROMPT, aiGatewayErrorResponse } from "../_shared/mls-description.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { leadId } = await req.json();
    if (!leadId) throw new Error("leadId is required");

    const { supabase, user } = await authenticate(req);
    const { factsText, allPhotos } = await buildWorkSheetContext(supabase, user, leadId);

    const userContent: any[] = [{ type: "text", text: factsText }];
    for (const url of allPhotos) userContent.push({ type: "image_url", image_url: { url } });

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [{ role: "system", content: MLS_SYSTEM_PROMPT }, { role: "user", content: userContent }],
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error("OpenAI error:", response.status, await response.text());
      return aiGatewayErrorResponse(response.status);
    }
    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("generate-mls-description error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
