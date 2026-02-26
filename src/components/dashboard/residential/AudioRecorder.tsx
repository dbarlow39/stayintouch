import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mic, Square, Loader2, FileAudio, FileText, Sparkles, Download, Copy, Check, RotateCcw, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FailedRecording {
  id: string;
  audio_file_path: string;
  created_at: string;
}

interface AudioRecorderProps {
  inspectionId?: string;
  userId: string;
}

type RecordingStatus = "idle" | "recording" | "uploading" | "transcribing" | "summarizing" | "completed" | "error";

const CHUNK_INTERVAL_MS = 10 * 60 * 1000;

export function AudioRecorder({ inspectionId, userId }: AudioRecorderProps) {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [audioFilePaths, setAudioFilePaths] = useState<string[]>([]);
  const [copiedTranscription, setCopiedTranscription] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [failedRecordings, setFailedRecordings] = useState<FailedRecording[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [uploadedChunks, setUploadedChunks] = useState(0);
  const [uploadingChunk, setUploadingChunk] = useState(false);
  const [currentTranscriptionId, setCurrentTranscriptionId] = useState<string | null>(null);
  const [retryingSummary, setRetryingSummary] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadedPathsRef = useRef<string[]>([]);
  const chunkIndexRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    loadFailedRecordings();
    loadCompletedTranscription();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearInterval(chunkTimerRef.current);
    };
  }, [userId, inspectionId]);

  const loadCompletedTranscription = async () => {
    if (!inspectionId) { setTranscription(null); setSummary(null); return; }
    const { data, error } = await supabase
      .from("audio_transcriptions")
      .select("id, transcription, summary, audio_file_path")
      .eq("user_id", userId)
      .eq("inspection_id", inspectionId)
      .in("status", ["completed", "transcribed", "summarizing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      setTranscription(data.transcription);
      setSummary(data.summary);
      setCurrentTranscriptionId(data.id);
      if (data.audio_file_path) {
        const paths = data.audio_file_path.includes(",") ? data.audio_file_path.split(",").map((p: string) => p.trim()) : [data.audio_file_path];
        setAudioFilePaths(paths);
      }
    }
  };

  const loadFailedRecordings = async () => {
    if (!inspectionId) { setFailedRecordings([]); return; }
    const { data, error } = await supabase
      .from("audio_transcriptions")
      .select("id, audio_file_path, created_at")
      .eq("user_id", userId)
      .eq("inspection_id", inspectionId)
      .in("status", ["error", "processing", "pending"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (!error && data) setFailedRecordings(data);
  };

  const retryTranscription = async (recording: FailedRecording) => {
    try {
      setRetryingId(recording.id);
      setStatus("transcribing");
      setAudioFilePaths([recording.audio_file_path]);
      toast.info("Retrying transcription...");
      const paths = recording.audio_file_path.includes(",") ? recording.audio_file_path.split(",").map(p => p.trim()) : [recording.audio_file_path];
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke("transcribe-audio", { body: { audioFilePaths: paths, transcriptionId: recording.id } });
      if (transcribeError) throw new Error(`Transcription failed: ${transcribeError.message}`);
      setTranscription(transcribeData.transcription);
      toast.success("Transcription complete!");
      setStatus("summarizing");
      toast.info("Generating summary...");
      const { data: summaryData, error: summaryError } = await supabase.functions.invoke("summarize-transcription", { body: { transcriptionId: recording.id } });
      if (summaryError) throw new Error(`Summarization failed: ${summaryError.message}`);
      setSummary(summaryData.summary);
      setStatus("completed");
      toast.success("Summary generated!");
      setFailedRecordings(prev => prev.filter(r => r.id !== recording.id));
    } catch (error) {
      console.error("Retry error:", error);
      setStatus("error");
      toast.error(error instanceof Error ? error.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const copyToClipboard = async (text: string, type: "transcription" | "summary") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "transcription") { setCopiedTranscription(true); setTimeout(() => setCopiedTranscription(false), 2000); }
      else { setCopiedSummary(true); setTimeout(() => setCopiedSummary(false), 2000); }
      toast.success(`${type === "transcription" ? "Transcription" : "Summary"} copied to clipboard!`);
    } catch { toast.error("Failed to copy to clipboard"); }
  };

  const downloadAudio = async () => {
    if (audioFilePaths.length === 0) return;
    try {
      const blobs: Blob[] = [];
      for (const path of audioFilePaths) {
        const { data, error } = await supabase.storage.from("audio-recordings").download(path);
        if (error) throw error;
        blobs.push(data);
      }
      const combinedBlob = new Blob(blobs, { type: "audio/webm" });
      const url = URL.createObjectURL(combinedBlob);
      const a = document.createElement("a");
      a.href = url; a.download = `recording-${Date.now()}.webm`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Audio downloaded!");
    } catch (error) { console.error("Download error:", error); toast.error("Failed to download audio"); }
  };

  const uploadChunk = useCallback(async (chunks: Blob[], chunkIndex: number): Promise<string | null> => {
    if (chunks.length === 0) return null;
    try {
      setUploadingChunk(true);
      const audioBlob = new Blob(chunks, { type: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      const fileName = `${userId}/${Date.now()}_chunk_${chunkIndex}.webm`;
      const { error: uploadError } = await supabase.storage.from("audio-recordings").upload(fileName, audioBlob);
      if (uploadError) { console.error("Chunk upload error:", uploadError); toast.error(`Failed to upload chunk ${chunkIndex + 1}`); return null; }
      setUploadedChunks(prev => prev + 1);
      return fileName;
    } catch (error) { console.error("Chunk upload error:", error); return null; }
    finally { setUploadingChunk(false); }
  }, [userId]);

  const createNewRecorder = useCallback(() => {
    if (!streamRef.current || !isRecordingRef.current) return;
    const stream = streamRef.current;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
    const newRecorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 });
    chunksRef.current = [];
    newRecorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
    newRecorder.onstop = async () => {
      const currentChunks = [...chunksRef.current];
      const currentIndex = chunkIndexRef.current;
      chunkIndexRef.current += 1;
      if (currentChunks.length > 0) {
        const uploadedPath = await uploadChunk(currentChunks, currentIndex);
        if (uploadedPath) uploadedPathsRef.current.push(uploadedPath);
      }
      if (isRecordingRef.current) createNewRecorder();
    };
    mediaRecorderRef.current = newRecorder;
    newRecorder.start(1000);
  }, [uploadChunk]);

  const saveCurrentChunk = useCallback(() => {
    if (!isRecordingRef.current || !mediaRecorderRef.current) return;
    if (mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 } });
      streamRef.current = stream;
      isRecordingRef.current = true;
      uploadedPathsRef.current = []; chunkIndexRef.current = 0; setUploadedChunks(0); chunksRef.current = [];
      createNewRecorder();
      setStatus("recording"); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      chunkTimerRef.current = setInterval(() => saveCurrentChunk(), CHUNK_INTERVAL_MS);
      toast.success("Recording started");
    } catch (error) { console.error("Failed to start recording:", error); toast.error("Failed to access microphone. Please check permissions."); }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && status === "recording") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (chunkTimerRef.current) { clearInterval(chunkTimerRef.current); chunkTimerRef.current = null; }
      isRecordingRef.current = false;
      if (mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
      await new Promise(resolve => setTimeout(resolve, 500));
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      await processRecording();
    }
  };

  const processRecording = async () => {
    try {
      setStatus("uploading");
      toast.info("Processing audio...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      const allPaths = [...uploadedPathsRef.current];
      if (allPaths.length === 0) throw new Error("No audio was recorded");
      setAudioFilePaths(allPaths);
      toast.success(`${allPaths.length} chunk(s) uploaded successfully`);

      const { data: transcriptionRecord, error: dbError } = await supabase
        .from("audio_transcriptions")
        .insert({ user_id: userId, inspection_id: inspectionId || null, audio_file_path: allPaths.join(","), duration_seconds: recordingTime, status: "pending" })
        .select().single();
      if (dbError) throw new Error(`Database error: ${dbError.message}`);

      setStatus("transcribing");
      toast.info(`Transcribing ${allPaths.length} audio segment(s)...`);
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke("transcribe-audio", { body: { audioFilePaths: allPaths, transcriptionId: transcriptionRecord.id } });
      if (transcribeError) throw new Error(`Transcription failed: ${transcribeError.message}`);
      setTranscription(transcribeData.transcription);
      toast.success("Transcription complete!");

      setStatus("summarizing");
      toast.info("Generating summary...");
      try {
        const { data: summaryData, error: summaryError } = await supabase.functions.invoke("summarize-transcription", { body: { transcriptionId: transcriptionRecord.id, transcription: transcribeData.transcription } });
        if (summaryError) { console.error("Summarization failed:", summaryError); toast.error("Summary generation failed. You can retry from the transcription view."); setStatus("completed"); return; }
        setSummary(summaryData.summary); setStatus("completed"); toast.success("Summary generated!");
      } catch (sumError) { console.error("Summary error:", sumError); toast.error("Summary generation failed, but transcription is saved."); setStatus("completed"); }
    } catch (error) { console.error("Processing error:", error); setStatus("error"); toast.error(error instanceof Error ? error.message : "Processing failed"); }
  };

  const retrySummary = async () => {
    if (!currentTranscriptionId || !transcription) return;
    setRetryingSummary(true);
    try {
      toast.info("Retrying summary generation...");
      const { data, error } = await supabase.functions.invoke("summarize-transcription", { body: { transcriptionId: currentTranscriptionId, transcription } });
      if (error) throw error;
      if (data?.summary) { setSummary(data.summary); toast.success("Summary generated!"); } else throw new Error("No summary returned");
    } catch (err) { console.error("Retry summary error:", err); toast.error("Summary generation failed."); }
    finally { setRetryingSummary(false); }
  };

  const resetRecorder = () => {
    setStatus("idle"); setRecordingTime(0); setTranscription(null); setSummary(null); setAudioFilePaths([]); setUploadedChunks(0);
    chunksRef.current = []; uploadedPathsRef.current = []; chunkIndexRef.current = 0;
  };

  const getStatusMessage = () => {
    switch (status) {
      case "recording": return "Recording...";
      case "uploading": return "Uploading...";
      case "transcribing": return "Transcribing with Whisper...";
      case "summarizing": return "Generating AI summary...";
      case "completed": return "Complete!";
      case "error": return "Error occurred";
      default: return "Ready to record";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader><CardTitle className="flex items-center gap-2"><FileAudio className="h-5 w-5" />Audio Recorder</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-center gap-4">
          <div className="text-4xl font-mono font-bold text-primary">{formatTime(recordingTime)}</div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {getStatusMessage()}
            {status === "recording" && uploadedChunks > 0 && <span className="flex items-center gap-1 text-green-600"><Upload className="h-3 w-3" />{uploadedChunks} saved</span>}
            {status === "recording" && uploadingChunk && <span className="flex items-center gap-1 text-blue-600"><Loader2 className="h-3 w-3 animate-spin" />Saving...</span>}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {status === "idle" && (
              <>
                <Button onClick={startRecording} size="lg" className="gap-2"><Mic className="h-5 w-5" />Start Recording</Button>
                {audioFilePaths.length > 0 && <Button onClick={downloadAudio} variant="secondary" size="lg" className="gap-2"><Download className="h-5 w-5" />Download Audio</Button>}
              </>
            )}
            {status === "recording" && <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2"><Square className="h-5 w-5" />Stop Recording</Button>}
            {(status === "uploading" || status === "transcribing" || status === "summarizing") && <Button disabled size="lg" className="gap-2"><Loader2 className="h-5 w-5 animate-spin" />Processing...</Button>}
            {(status === "completed" || status === "error") && (
              <>
                <Button onClick={resetRecorder} variant="outline" size="lg" className="gap-2"><Mic className="h-5 w-5" />New Recording</Button>
                {audioFilePaths.length > 0 && <Button onClick={downloadAudio} variant="secondary" size="lg" className="gap-2"><Download className="h-5 w-5" />Download Audio</Button>}
              </>
            )}
          </div>
          {status === "recording" && <p className="text-xs text-muted-foreground text-center">Auto-saves every 10 minutes • No time limit</p>}
          {failedRecordings.length > 0 && status === "idle" && (
            <div className="w-full pt-4 border-t">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2"><RotateCcw className="h-4 w-4" />Retry Failed Transcriptions</h4>
              <div className="space-y-2">
                {failedRecordings.map((recording) => (
                  <div key={recording.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                    <span className="text-xs text-muted-foreground">{new Date(recording.created_at).toLocaleString()}</span>
                    <Button size="sm" variant="outline" onClick={() => retryTranscription(recording)} disabled={retryingId !== null} className="gap-1">
                      {retryingId === recording.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}Retry
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {summary && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2"><Sparkles className="h-4 w-4" />AI Summary</h4>
              <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={() => copyToClipboard(summary, "summary")}>
                {copiedSummary ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}{copiedSummary ? "Copied!" : "Copy"}
              </Button>
            </div>
            <div className="bg-muted p-3 rounded-md max-h-64 overflow-y-auto text-sm whitespace-pre-wrap">
              <p className="font-bold mb-2">Property Inspection Summary</p>
              {summary.replace(/\*?\*?Property Inspection Summary\*?\*?\n?/g, "").trim()}
            </div>
          </div>
        )}
        {transcription && !summary && status !== "summarizing" && (
          <div className="pt-4 border-t">
            <Button onClick={retrySummary} disabled={retryingSummary} variant="outline" className="w-full gap-2">
              {retryingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {retryingSummary ? "Generating Summary..." : "Generate AI Summary"}
            </Button>
          </div>
        )}
        {transcription && (
          <div className="space-y-2 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h4 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4" />Transcription</h4>
              <Button variant="ghost" size="sm" className="gap-1 h-8" onClick={() => copyToClipboard(transcription, "transcription")}>
                {copiedTranscription ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}{copiedTranscription ? "Copied!" : "Copy"}
              </Button>
            </div>
            <div className="bg-muted p-3 rounded-md max-h-48 overflow-y-auto text-sm">
              <p className="font-bold mb-2">Property Inspection Transcription</p>
              {transcription}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
