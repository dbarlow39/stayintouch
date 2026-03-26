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
    if (response.status === 413) throw new Error(`Audio chunk too large for Whisper (${(blob.size / 1024 / 1024).toFixed(1)} MB).`);
    const errorText = await response.text();
    throw new Error(`Whisper API error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.text ?? "";
}

// Normal path: called for regular small recordings where the file path is passed.
// Downloads from storage and sends to Whisper. Only used when file is small enough.
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

  // Fallback split for unexpectedly large files on the normal path
  console.log(`File exceeds limit — splitting...`);
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
  if (headerEnd === -1) return await transcribeBlob(audioData, OPENAI_API_KEY);

  const header = buffer.slice(0, headerEnd);
  const body = buffer.slice(headerEnd);
  const maxBodyPerChunk = WHISPER_MAX_BYTES - header.length;
  if (maxBodyPerChunk <= 0) throw new Error("WebM header exceeds Whisper size limit.");

  const totalChunks = Math.ceil(body.length / maxBodyPerChunk);
  const transcriptions: string[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const start = i * maxBodyPerChunk;
    const end = Math.min(start + maxBodyPerChunk, body.length);
    const bodySlice = body.slice(start, end);
    const chunk = new Uint8Array(header.length + bodySlice.length);
    chunk.set(header, 0);
    chunk.set(bodySlice, header.length);
    try {
      const text = await transcribeBlob(new Blob([chunk], { type: "audio/webm" }), OPENAI_API_KEY);
      transcriptions.push(text);
    } catch (err) {
      transcriptions.push(`[Chunk ${i + 1} failed: ${err instanceof Error ? err.message : String(err)}]`);
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
  await supabase
    .from("audio_transcriptions")
    .update({ transcription, status: "transcribed" })
    .eq("id", transcriptionId);

  return transcription;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const contentType = req.headers.get("content-type") ?? "";

    // -------------------------------------------------------------------------
    // BINARY PATH: browser sends audio blob directly in the request body.
    // Used for the retry/re-chunk flow on large recordings. The edge function
    // never downloads anything from Supabase Storage here, so WORKER_LIMIT
    // cannot be triggered regardless of audio file size.
    // -------------------------------------------------------------------------
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audioFile = formData.get("file") as File | null;
      if (!audioFile) throw new Error("No audio file in request body");

      const sizeMB = (audioFile.size / 1024 / 1024).toFixed(1);
      console.log(`Binary path: received ${sizeMB} MB directly`);

      let text: string;

      if (audioFile.size <= WHISPER_MAX_BYTES) {
        text = await transcribeBlob(audioFile, OPENAI_API_KEY);
      } else {
        // Safety split for oversized binary uploads
        console.log(`Binary file exceeds limit — splitting...`);
        const buffer = new Uint8Array(await audioFile.arrayBuffer());
        const SEARCH_LIMIT = Math.min(64 * 1024, buffer.length);
        let headerEnd = -1;
        for (let i = 0; i < SEARCH_LIMIT - 4; i++) {
          if (buffer[i] === 0x1F && buffer[i+1] === 0x43 && buffer[i+2] === 0xB6 && buffer[i+3] === 0x75) {
            headerEnd = i;
            break;
          }
        }
        if (headerEnd === -1) {
          text = await transcribeBlob(audioFile, OPENAI_API_KEY);
        } else {
          const header = buffer.slice(0, headerEnd);
          const body = buffer.slice(headerEnd);
          const maxBody = WHISPER_MAX_BYTES - header.length;
          if (maxBody <= 0) throw new Error("WebM header exceeds Whisper size limit.");
          const total = Math.ceil(body.length / maxBody);
          const parts: string[] = [];
          for (let i = 0; i < total; i++) {
            const slice = body.slice(i * maxBody, Math.min((i+1) * maxBody, body.length));
            const chunk = new Uint8Array(header.length + slice.length);
            chunk.set(header, 0);
            chunk.set(slice, header.length);
            try {
              parts.push(await transcribeBlob(new Blob([chunk], { type: "audio/webm" }), OPENAI_API_KEY));
            } catch (err) {
              parts.push(`[Chunk ${i+1} failed: ${err instanceof Error ? err.message : String(err)}]`);
            }
          }
          text = parts.join(" ");
        }
      }

      return new Response(
        JSON.stringify({ success: true, transcription: text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // NORMAL PATH: receives file path(s), downloads from storage.
    // Used for regular small recordings (each chunk ~240 KB at 64 kbps / 30 s).
    // -------------------------------------------------------------------------
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
