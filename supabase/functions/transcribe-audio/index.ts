import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

async function transcribeBlob(blob: Blob, OPENAI_API_KEY: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("language", "en");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("OpenAI rate limit exceeded. Please wait a moment and retry.");
    if (response.status === 401) throw new Error("Invalid OpenAI API key.");
    if (response.status === 413) throw new Error(`Audio chunk still too large for Whisper (${(blob.size / 1024 / 1024).toFixed(1)} MB).`);
    const errorText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.text ?? "";
}

async function transcribeFile(
  supabase: ReturnType<typeof createClient>,
  audioFilePath: string,
  OPENAI_API_KEY: string
): Promise<string> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from("audio-recordings")
    .download(audioFilePath);

  if (downloadError) throw new Error(`Failed to download audio: ${downloadError.message}`);

  const fileSizeMB = (audioData.size / 1024 / 1024).toFixed(1);
  console.log(`File ${audioFilePath}: ${fileSizeMB} MB`);

  if (audioData.size <= WHISPER_MAX_BYTES) {
    return await transcribeBlob(audioData, OPENAI_API_KEY);
  }

  console.log(`File exceeds ${WHISPER_MAX_BYTES / 1024 / 1024} MB — splitting into chunks...`);

  const arrayBuffer = await audioData.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const SEARCH_LIMIT = Math.min(64 * 1024, buffer.length);
  let headerEnd = -1;
  for (let i = 0; i < SEARCH_LIMIT - 4; i++) {
    if (buffer[i] === 0x1F && buffer[i + 1] === 0x43 && buffer[i + 2] === 0xB6 && buffer[i + 3] === 0x75) {
      headerEnd = i;
      break;
    }
  }

  if (headerEnd === -1) {
    console.log("No WebM header boundary found in first 64 KB; sending as-is");
    return await transcribeBlob(audioData, OPENAI_API_KEY);
  }

  const header = buffer.slice(0, headerEnd);
  const body = buffer.slice(headerEnd);
  const maxBodyPerChunk = WHISPER_MAX_BYTES - header.length;

  if (maxBodyPerChunk <= 0) {
    throw new Error("WebM header is larger than Whisper's file size limit.");
  }

  const totalChunks = Math.ceil(body.length / maxBodyPerChunk);
  console.log(`Splitting into ${totalChunks} chunks (header: ${header.length} bytes, body: ${body.length} bytes)`);

  const transcriptions: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * maxBodyPerChunk;
    const end = Math.min(start + maxBodyPerChunk, body.length);
    const bodySlice = body.slice(start, end);

    const chunk = new Uint8Array(header.length + bodySlice.length);
    chunk.set(header, 0);
    chunk.set(bodySlice, header.length);

    const chunkBlob = new Blob([chunk], { type: "audio/webm" });
    const chunkMB = (chunkBlob.size / 1024 / 1024).toFixed(1);
    console.log(`Transcribing chunk ${i + 1}/${totalChunks} (${chunkMB} MB)`);

    try {
      const text = await transcribeBlob(chunkBlob, OPENAI_API_KEY);
      transcriptions.push(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Chunk ${i + 1} failed: ${msg}`);
      transcriptions.push(`[Chunk ${i + 1} failed: ${msg}]`);
    }
  }

  return transcriptions.join(" ");
}

async function processTranscription(
  audioFilePaths: string[],
  transcriptionId: string,
  OPENAI_API_KEY: string
): Promise<string> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  await supabase
    .from("audio_transcriptions")
    .update({ status: "processing" })
    .eq("id", transcriptionId);

  console.log(`Processing ${audioFilePaths.length} audio segment(s)`);

  const transcriptions: string[] = [];

  for (let i = 0; i < audioFilePaths.length; i++) {
    const filePath = audioFilePaths[i].trim();
    console.log(`Transcribing segment ${i + 1}/${audioFilePaths.length}: ${filePath}`);
    try {
      const text = await transcribeFile(supabase, filePath, OPENAI_API_KEY);
      transcriptions.push(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Segment ${i + 1} failed: ${msg}`);
      transcriptions.push(`[Segment ${i + 1} failed: ${msg}]`);
    }
  }

  const transcription = transcriptions.join(" ");
  console.log(`Transcription complete — ${audioFilePaths.length} segment(s) processed`);

  await supabase
    .from("audio_transcriptions")
    .update({ transcription, status: "transcribed" })
    .eq("id", transcriptionId);

  return transcription;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    let audioFilePaths: string[];
    if (body.audioFilePaths && Array.isArray(body.audioFilePaths)) {
      audioFilePaths = body.audioFilePaths;
    } else if (body.audioFilePath) {
      audioFilePaths = body.audioFilePath.includes(",")
        ? body.audioFilePath.split(",")
        : [body.audioFilePath];
    } else {
      throw new Error("No audio file paths provided");
    }

    const { transcriptionId } = body;
    if (!transcriptionId) throw new Error("transcriptionId is required");

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const transcription = await processTranscription(audioFilePaths, transcriptionId, OPENAI_API_KEY);

    return new Response(
      JSON.stringify({ success: true, transcription }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("transcribe-audio error:", msg);

    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
