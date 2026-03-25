import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 24 * 1024 * 1024; // Stay under OpenAI's 25MB limit with margin

// Find all cluster offsets (WebM Cluster element ID: 0x1F43B675)
function findClusterOffsets(buffer: Uint8Array): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x1F && buffer[i + 1] === 0x43 && buffer[i + 2] === 0xB6 && buffer[i + 3] === 0x75) {
      offsets.push(i);
    }
  }
  return offsets;
}

// Find the first cluster offset (= end of WebM header)
function findWebmHeaderEnd(buffer: Uint8Array): number {
  for (let i = 0; i < buffer.length - 4; i++) {
    if (buffer[i] === 0x1F && buffer[i + 1] === 0x43 && buffer[i + 2] === 0xB6 && buffer[i + 3] === 0x75) {
      return i;
    }
  }
  return -1;
}

async function transcribeAudio(audioData: Blob, OPENAI_API_KEY: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioData, "audio.webm");
  formData.append("model", "whisper-1");
  formData.append("language", "en");
  const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });
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

// Compute chunk boundary ranges without allocating chunk data
function computeChunkRanges(
  headerLength: number,
  clusterOffsets: number[],
  bufferLength: number
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  let currentStart = 0; // index into clusterOffsets

  for (let i = 1; i <= clusterOffsets.length; i++) {
    const nextOffset = i < clusterOffsets.length ? clusterOffsets[i] : bufferLength;
    const chunkDataSize = nextOffset - clusterOffsets[currentStart];
    const totalSize = headerLength + chunkDataSize;

    if (totalSize > MAX_FILE_SIZE && i > currentStart + 1) {
      // Cut before this cluster
      ranges.push({ start: clusterOffsets[currentStart], end: clusterOffsets[i - 1] });
      currentStart = i - 1;
    }

    if (i === clusterOffsets.length) {
      ranges.push({ start: clusterOffsets[currentStart], end: bufferLength });
    }
  }

  return ranges;
}

async function transcribeFile(supabase: any, audioFilePath: string, OPENAI_API_KEY: string): Promise<string> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from("audio-recordings")
    .download(audioFilePath);
  if (downloadError) throw new Error(`Failed to download audio: ${downloadError.message}`);

  const fileSizeMB = (audioData.size / 1024 / 1024).toFixed(1);
  console.log(`File ${audioFilePath}: ${fileSizeMB}MB`);

  if (audioData.size <= MAX_FILE_SIZE) {
    return await transcribeAudio(audioData, OPENAI_API_KEY);
  }

  // File too large — split at WebM cluster boundaries, one chunk at a time
  console.log(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB, splitting at cluster boundaries...`);
  const arrayBuffer = await audioData.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const headerEnd = findWebmHeaderEnd(buffer);
  if (headerEnd === -1) {
    console.log("No WebM clusters found, cannot split. Attempting as-is...");
    return await transcribeAudio(audioData, OPENAI_API_KEY);
  }

  const header = buffer.slice(0, headerEnd);
  const clusterOffsets = findClusterOffsets(buffer);
  console.log(`Found ${clusterOffsets.length} clusters, header size: ${header.length} bytes`);

  if (clusterOffsets.length <= 1) {
    return await transcribeAudio(audioData, OPENAI_API_KEY);
  }

  // Compute ranges without allocating chunk data
  const ranges = computeChunkRanges(header.length, clusterOffsets, buffer.length);
  console.log(`Will process ${ranges.length} chunks: ${ranges.map(r => ((header.length + r.end - r.start) / 1024 / 1024).toFixed(1) + "MB").join(", ")}`);

  // Process chunks SEQUENTIALLY to minimize peak memory
  const transcriptions: string[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const chunkDataSize = range.end - range.start;
    console.log(`Transcribing chunk ${i + 1}/${ranges.length} (${((header.length + chunkDataSize) / 1024 / 1024).toFixed(1)}MB)`);

    try {
      // Create chunk: header + cluster data (only one chunk in memory at a time)
      const fullChunk = new Uint8Array(header.length + chunkDataSize);
      fullChunk.set(header, 0);
      fullChunk.set(buffer.subarray(range.start, range.end), header.length);

      const blob = new Blob([fullChunk], { type: "audio/webm" });
      const text = await transcribeAudio(blob, OPENAI_API_KEY);
      transcriptions.push(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Chunk ${i + 1} failed: ${msg}`);
      transcriptions.push(`[Chunk ${i + 1} failed: ${msg}]`);
    }
  }

  return transcriptions.join(" ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    let audioFilePaths: string[];
    if (body.audioFilePaths && Array.isArray(body.audioFilePaths))
      audioFilePaths = body.audioFilePaths;
    else if (body.audioFilePath)
      audioFilePaths = body.audioFilePath.includes(",")
        ? body.audioFilePath.split(",")
        : [body.audioFilePath];
    else throw new Error("No audio file paths provided");

    const { transcriptionId } = body;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase
      .from("audio_transcriptions")
      .update({ status: "processing" })
      .eq("id", transcriptionId);

    console.log(`Processing ${audioFilePaths.length} audio segments`);

    // Process segments SEQUENTIALLY to avoid memory spikes
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
    console.log(`Transcription complete. Total segments: ${audioFilePaths.length}`);

    await supabase
      .from("audio_transcriptions")
      .update({ transcription, status: "transcribed" })
      .eq("id", transcriptionId);

    return new Response(JSON.stringify({ success: true, transcription }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
