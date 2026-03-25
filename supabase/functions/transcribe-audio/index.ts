import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 24 * 1024 * 1024; // Stay under OpenAI's 25MB limit with margin
const WEBM_CLUSTER_ID = 0x1F43B675;

// Find the WebM header (everything before the first Cluster element)
function findWebmHeaderEnd(buffer: Uint8Array): number {
  // Cluster element ID is 4 bytes: 0x1F 0x43 0xB6 0x75
  for (let i = 0; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x1F && buffer[i + 1] === 0x43 && buffer[i + 2] === 0xB6 && buffer[i + 3] === 0x75) {
      return i;
    }
  }
  return -1;
}

// Find all cluster offsets in the buffer
function findClusterOffsets(buffer: Uint8Array): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x1F && buffer[i + 1] === 0x43 && buffer[i + 2] === 0xB6 && buffer[i + 3] === 0x75) {
      offsets.push(i);
    }
  }
  return offsets;
}

// Split a large WebM file into chunks, each with the header prepended
function splitWebmFile(buffer: Uint8Array): Uint8Array[] {
  const headerEnd = findWebmHeaderEnd(buffer);
  if (headerEnd === -1) {
    console.log("No WebM clusters found, sending file as-is");
    return [buffer];
  }

  const header = buffer.slice(0, headerEnd);
  const clusterOffsets = findClusterOffsets(buffer);
  console.log(`Found ${clusterOffsets.length} clusters, header size: ${header.length} bytes`);

  if (clusterOffsets.length <= 1) {
    return [buffer];
  }

  const chunks: Uint8Array[] = [];
  let currentChunkStart = clusterOffsets[0];
  
  for (let i = 1; i <= clusterOffsets.length; i++) {
    const nextOffset = i < clusterOffsets.length ? clusterOffsets[i] : buffer.length;
    const currentChunkSize = header.length + (nextOffset - currentChunkStart);
    
    // If adding the next cluster would exceed the limit, cut here
    if (currentChunkSize > MAX_FILE_SIZE && i > 0) {
      const chunkData = buffer.slice(currentChunkStart, clusterOffsets[i - 1] || nextOffset);
      const fullChunk = new Uint8Array(header.length + chunkData.length);
      fullChunk.set(header, 0);
      fullChunk.set(chunkData, header.length);
      chunks.push(fullChunk);
      currentChunkStart = clusterOffsets[i - 1] || nextOffset;
    }
    
    // Last iteration - flush remaining
    if (i === clusterOffsets.length) {
      const chunkData = buffer.slice(currentChunkStart, buffer.length);
      const fullChunk = new Uint8Array(header.length + chunkData.length);
      fullChunk.set(header, 0);
      fullChunk.set(chunkData, header.length);
      chunks.push(fullChunk);
    }
  }

  // If no splits happened (all clusters fit in one chunk somehow), just split by size
  if (chunks.length === 0) {
    chunks.push(buffer);
  }

  console.log(`Split into ${chunks.length} chunks: ${chunks.map(c => (c.length / 1024 / 1024).toFixed(1) + "MB").join(", ")}`);
  return chunks;
}

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
  
  console.log(`File ${audioFilePath}: ${(audioData.size / 1024 / 1024).toFixed(1)}MB`);
  
  if (audioData.size <= MAX_FILE_SIZE) {
    return await transcribeAudio(audioData, OPENAI_API_KEY);
  }

  // File too large — split at WebM cluster boundaries
  console.log(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB, splitting at cluster boundaries...`);
  const arrayBuffer = await audioData.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const chunks = splitWebmFile(buffer);
  
  const transcriptions: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Transcribing sub-chunk ${i + 1}/${chunks.length} (${(chunks[i].length / 1024 / 1024).toFixed(1)}MB)`);
    try {
      const blob = new Blob([chunks[i]], { type: "audio/webm" });
      const text = await transcribeAudio(blob, OPENAI_API_KEY);
      transcriptions.push(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Sub-chunk ${i + 1} failed: ${msg}`);
      transcriptions.push(`[Sub-chunk ${i + 1} failed: ${msg}]`);
    }
  }
  
  return transcriptions.join(" ");
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
    await supabase.from("audio_transcriptions").update({ status: "processing" }).eq("id", transcriptionId);
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
