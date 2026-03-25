import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // OpenAI's 25MB limit

async function transcribeAudio(audioData: Blob, OPENAI_API_KEY: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioData, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("language", "en");
  const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }, body: formData });
  if (!whisperResponse.ok) {
    if (whisperResponse.status === 429) throw new Error("OpenAI rate limit exceeded.");
    if (whisperResponse.status === 401) throw new Error("Invalid OpenAI API key.");
    if (whisperResponse.status === 413) throw new Error("Audio file too large for Whisper API.");
    const errorText = await whisperResponse.text();
    throw new Error(`Whisper API error ${whisperResponse.status}: ${errorText}`);
  }
  const result = await whisperResponse.json();
  return result.text;
}

async function transcribeFile(supabase: any, audioFilePath: string, OPENAI_API_KEY: string): Promise<string> {
  const { data: audioData, error: downloadError } = await supabase.storage.from("audio-recordings").download(audioFilePath);
  if (downloadError) throw new Error(`Failed to download audio: ${downloadError.message}`);
  if (audioData.size > MAX_FILE_SIZE) {
    throw new Error(`Audio file is ${(audioData.size / 1024 / 1024).toFixed(1)}MB, exceeds 25MB limit. Please use shorter recordings.`);
  }
  return await transcribeAudio(audioData, OPENAI_API_KEY);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    let audioFilePaths: string[];
    if (body.audioFilePaths && Array.isArray(body.audioFilePaths)) audioFilePaths = body.audioFilePaths;
    else if (body.audioFilePath) audioFilePaths = body.audioFilePath.includes(",") ? body.audioFilePath.split(",") : [body.audioFilePath];
    else throw new Error("No audio file paths provided");
    const { transcriptionId } = body;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    console.log(`Processing ${audioFilePaths.length} audio segments`);
    const results = await Promise.allSettled(audioFilePaths.map((filePath, i) => {
      console.log(`Transcribing segment ${i + 1}: ${filePath.trim()}`);
      return transcribeFile(supabase, filePath.trim(), OPENAI_API_KEY);
    }));
    const transcription = results.map((result, i) => {
      if (result.status === "fulfilled") return result.value;
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error(`Segment ${i + 1} failed: ${reason}`);
      return `[Segment ${i + 1} failed: ${reason}]`;
    }).join(" ");
    console.log(`Transcription complete. Total segments: ${results.length}, failed: ${results.filter(r => r.status === "rejected").length}`);
    await supabase.from("audio_transcriptions").update({ transcription, status: "transcribed" }).eq("id", transcriptionId);
    return new Response(JSON.stringify({ success: true, transcription }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
