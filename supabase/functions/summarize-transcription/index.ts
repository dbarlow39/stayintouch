import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { transcriptionId, transcription: providedTranscription } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let transcriptionText = providedTranscription;
    if (!transcriptionText) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase.from("audio_transcriptions").select("transcription").eq("id", transcriptionId).single();
        if (!error && data?.transcription) { transcriptionText = data.transcription; break; }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!transcriptionText) throw new Error("Transcription not found after retries");
    await supabase.from("audio_transcriptions").update({ status: "summarizing" }).eq("id", transcriptionId);
    const MAX_CHARS = 15000;
    let textForSummary = transcriptionText;
    if (textForSummary.length > MAX_CHARS) textForSummary = textForSummary.substring(0, MAX_CHARS) + "\n\n[Transcription truncated]";

    const systemPrompt = `You are an expert at summarizing property inspection recordings. Do NOT include a title or header. Create a structured summary with: 1. Key observations 2. Areas of concern 3. Recommended actions 4. Overall condition assessment. Be concise but thorough. Use bullet points.`;
    const userPrompt = `Please summarize this property inspection recording transcription:\n\n${textForSummary}`;
    const gatewayModels = ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash", "google/gemini-3-flash-preview"];
    let summary = ""; let lastError = "";
    for (const model of gatewayModels) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] }),
        });
        if (!aiResponse.ok) { lastError = `${model}: ${aiResponse.status}`; if (aiResponse.status === 402) throw new Error("Payment required."); continue; }
        const aiResult = await aiResponse.json();
        summary = aiResult.choices?.[0]?.message?.content || "";
        if (summary) break;
      } catch (e) { if (e instanceof Error && e.message.includes("Payment required")) throw e; lastError = e instanceof Error ? e.message : String(e); }
    }
    if (!summary) throw new Error(`All models failed. Last error: ${lastError}`);
    await supabase.from("audio_transcriptions").update({ summary, status: "completed" }).eq("id", transcriptionId);
    return new Response(JSON.stringify({ success: true, summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
