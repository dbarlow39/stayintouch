import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toPng } from "html-to-image";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileText,
  Loader2,
  Download,
  Sparkles,
  X,
  CheckCircle2,
  BarChart3,
  Image as ImageIcon,
  StickyNote,
  MessageCircle,
  Send,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { generateMarketAnalysisDocx } from "@/utils/marketAnalysisDocx";
import BullseyeGraphic from "@/components/dashboard/sellerLead/BullseyeGraphic";
import ZillowGraphic from "@/components/dashboard/sellerLead/ZillowGraphic";

interface DocumentSlot {
  label: string;
  description: string;
  file: File | null;
  required: boolean;
  savedFilePath?: string;
  savedFileName?: string;
}

interface BuyerMarketAnalysisTabProps {
  lead: any;
}

const BuyerMarketAnalysisTab = ({ lead }: BuyerMarketAnalysisTabProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [generating, setGenerating] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [analysis, setAnalysis] = useState<any>(null);
  const [bullseyeImage, setBullseyeImage] = useState<string | null>(null);
  const [zillowImage, setZillowImage] = useState<string | null>(null);
  const bullseyeRef = useRef<HTMLDivElement>(null);
  const zillowRef = useRef<HTMLDivElement>(null);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [aiNotes, setAiNotes] = useState("");
  
  // Chat Q&A state
  type ChatMessage = { role: "user" | "assistant"; content: string };
  const [chatMode, setChatMode] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [uploadedDocsRef, setUploadedDocsRef] = useState<{ name: string; filePath: string; mimeType: string }[]>([]);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentSlot[]>([
    { label: "Reallist Report", description: "Reallist property report", file: null, required: false },
    { label: "Subject Property MLS Sheet", description: "MLS listing sheet for the subject property", file: null, required: false },
    { label: "CMA / Property Detail Report", description: "CoreLogic, RPR, or similar report", file: null, required: false },
  ]);

  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load previously saved files and analysis for this lead
  useEffect(() => {
    if (!user || !lead?.id) { setLoadingSaved(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("market_analysis_files")
          .select("*")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false });
        if (!error && data) {
          setSavedFiles(data);
          const withAnalysis = data.find((f: any) => f.analysis_json);
          if (withAnalysis?.analysis_json) {
            setAnalysis(withAnalysis.analysis_json);
          }
          const sourceDocs = data.filter((f: any) => f.file_type === "source_doc" && f.document_label);
          setDocuments((prev) =>
            prev.map((slot) => {
              const saved = sourceDocs.find((f: any) => f.document_label === slot.label);
              if (saved) {
                return { ...slot, savedFilePath: saved.file_path, savedFileName: saved.file_name };
              }
              return slot;
            })
          );
        }
      } catch {}
      setLoadingSaved(false);
    })();
  }, [user, lead?.id]);

  const handleFileSelect = (index: number, file: File | null) => {
    setDocuments((prev) =>
      prev.map((doc, i) => (i === index ? { ...doc, file } : doc))
    );
  };

  const uploadFilesToStorage = async (docs: DocumentSlot[]): Promise<{ name: string; filePath: string; mimeType: string }[]> => {
    if (!user) throw new Error("Not authenticated");
    const uploaded: { name: string; filePath: string; mimeType: string }[] = [];
    for (const doc of docs) {
      if (doc.file) {
        const ext = doc.file.name.split(".").pop() || "pdf";
        const filePath = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("market-analysis-docs").upload(filePath, doc.file);
        if (error) throw new Error(`Failed to upload ${doc.label}: ${error.message}`);
        uploaded.push({ name: doc.label, filePath, mimeType: doc.file.type || "application/pdf" });
      } else if (doc.savedFilePath) {
        uploaded.push({ name: doc.label, filePath: doc.savedFilePath, mimeType: "application/pdf" });
      }
    }
    return uploaded;
  };

  const hasRequiredDocs = documents
    .filter((d) => d.required)
    .every((d) => d.file !== null);

  const uploadedCount = documents.filter((d) => d.file !== null || d.savedFilePath).length;

  const captureGraphic = useCallback(async (element: HTMLDivElement): Promise<string> => {
    return await toPng(element, {
      quality: 1,
      pixelRatio: 2,
      backgroundColor: "#FFFFFF",
    });
  }, []);

  const [pendingAutoDownload, setPendingAutoDownload] = useState(false);

  const streamChatResponse = async (
    docs: { name: string; filePath: string; mimeType: string }[] | null,
    messages: ChatMessage[],
    notes?: string
  ) => {
    setChatStreaming(true);
    let assistantContent = "";

    try {
      const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-analysis-chat`;
      const body: any = { messages };
      if (docs) {
        body.documents = docs;
        body.agentNotes = notes || undefined;
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text();
        throw new Error(errText || "Failed to start chat stream");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setChatMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (err: any) {
      console.error("Chat stream error:", err);
      toast({
        title: "Chat error",
        description: err.message || "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setChatStreaming(false);
    }

    return assistantContent;
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleStartChat = async () => {
    setGenerating(true);
    setProgressMessage("Uploading documents...");
    setAnalysis(null);
    setBullseyeImage(null);
    setZillowImage(null);
    setChatMessages([]);

    try {
      const uploadedDocs = await uploadFilesToStorage(documents);
      setUploadedDocsRef(uploadedDocs);
      setProgressMessage("AI is reviewing your documents...");
      setChatMode(true);

      await streamChatResponse(uploadedDocs, [], aiNotes.trim());
      setProgressMessage("");
      setGenerating(false);
    } catch (err: any) {
      console.error("Chat start error:", err);
      toast({
        title: "Error starting review",
        description: err.message || "Please try again",
        variant: "destructive",
      });
      setGenerating(false);
      setProgressMessage("");
    }
  };

  const handleSendChatMessage = async () => {
    if (!chatInput.trim() || chatStreaming) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    
    const response = await streamChatResponse(null, updatedMessages);
    
    if (response.trim() === "READY_TO_GENERATE") {
      setChatMessages((prev) => prev.filter((m) => m.content.trim() !== "READY_TO_GENERATE"));
      handleFinalGenerate();
    }
  };

  const handleFinalGenerate = async () => {
    setGenerating(true);
    setProgressMessage("Generating final analysis...");

    try {
      const conversationContext = chatMessages
        .filter((m) => m.content.trim() !== "READY_TO_GENERATE")
        .map((m) => `${m.role === "user" ? "Agent" : "AI"}: ${m.content}`)
        .join("\n\n");

      const combinedNotes = [
        aiNotes.trim(),
        conversationContext ? `\n\n--- Q&A Conversation ---\n${conversationContext}` : "",
      ].filter(Boolean).join("");

      const buyerNames: string[] = [];
      if (lead?.first_name) buyerNames.push(lead.first_name);
      const secondBuyerName = (lead?.preferences as any)?.second_buyer_name;
      if (secondBuyerName) {
        const firstName = secondBuyerName.split(" ")[0];
        if (firstName) buyerNames.push(firstName);
      }

      const { data, error } = await supabase.functions.invoke("generate-market-analysis", {
        body: {
          documents: uploadedDocsRef,
          agentNotes: combinedNotes || undefined,
          buyerNames: buyerNames.length > 0 ? buyerNames : undefined,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.analysis) throw new Error("No analysis returned from AI");

      setAnalysis(data.analysis);
      setChatMode(false);

      if (user && lead?.id) {
        try {
          const fileRows = uploadedDocsRef.map((doc) => ({
            lead_id: lead.id,
            agent_id: user.id,
            file_name: doc.name,
            file_path: doc.filePath,
            file_type: "source_doc",
            mime_type: doc.mimeType,
            document_label: doc.name,
          }));
          fileRows.push({
            lead_id: lead.id,
            agent_id: user.id,
            file_name: "Market Analysis Data",
            file_path: "",
            file_type: "analysis_json",
            mime_type: "application/json",
            document_label: "Generated Analysis",
          });
          await supabase.from("market_analysis_files").delete().eq("lead_id", lead.id);
          const rowsToInsert = fileRows.map((row, i) => ({
            ...row,
            analysis_json: i === fileRows.length - 1 ? data.analysis : null,
          }));
          const { error: insertError } = await supabase.from("market_analysis_files").insert(rowsToInsert);
          if (insertError) console.error("Failed to save file references:", insertError);
          const { data: refreshed } = await supabase
            .from("market_analysis_files")
            .select("*")
            .eq("lead_id", lead.id)
            .order("created_at", { ascending: false });
          if (refreshed) setSavedFiles(refreshed);
        } catch (persistErr) {
          console.error("Persistence error:", persistErr);
        }
      }

      setPendingAutoDownload(true);
      setProgressMessage("Rendering graphics...");
    } catch (err: any) {
      console.error("Market analysis error:", err);
      toast({
        title: "Error generating analysis",
        description: err.message || "Please try again",
        variant: "destructive",
      });
      setGenerating(false);
      setProgressMessage("");
    }
  };

  useEffect(() => {
    if (!pendingAutoDownload || !analysis) return;

    const captureAndDownload = async () => {
      try {
        await new Promise((r) => setTimeout(r, 300));

        const allImages = document.querySelectorAll('img');
        await Promise.all(
          Array.from(allImages).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 2000);
            });
          })
        );

        await new Promise((r) => setTimeout(r, 500));

        let capturedBullseye: string | null = null;
        let capturedZillow: string | null = null;

        if (bullseyeRef.current) {
          capturedBullseye = await captureGraphic(bullseyeRef.current);
          setBullseyeImage(capturedBullseye);
        }
        if (zillowRef.current) {
          capturedZillow = await captureGraphic(zillowRef.current);
          setZillowImage(capturedZillow);
        }

        setProgressMessage("Building document...");
        await generateMarketAnalysisDocx(analysis, capturedBullseye, capturedZillow);
        toast({ title: "Market analysis document downloaded" });
      } catch (err: any) {
        console.error("Auto-download error:", err);
        toast({
          title: "Error building document",
          description: err.message || "Analysis is ready - try the Download button.",
          variant: "destructive",
        });
      } finally {
        setGenerating(false);
        setProgressMessage("");
        setPendingAutoDownload(false);
      }
    };

    captureAndDownload();
  }, [pendingAutoDownload, analysis, captureGraphic, toast]);

  const handleDownload = async () => {
    if (!analysis) return;
    try {
      await generateMarketAnalysisDocx(analysis, bullseyeImage, zillowImage);
      toast({ title: "Document downloaded successfully" });
    } catch (err: any) {
      console.error("DOCX generation error:", err);
      toast({
        title: "Error generating document",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    }
  };

  const pricing = analysis?.pricing;
  const prop = analysis?.property;

  const formatBracketLabel = (low: string, high: string): string => {
    const fmt = (v: string) => {
      const n = parseInt(v.replace(/[^0-9]/g, ''));
      if (!n) return v;
      return n >= 1000 ? `$${n / 1000}K` : `$${n}`;
    };
    return `${fmt(low)}-${fmt(high)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Buyer Market Analysis</h3>
        <p className="text-sm text-muted-foreground">
          Upload property documents to generate a professional Buyer Market Analysis
        </p>
      </div>

      {/* Document Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Documents
            <Badge variant="secondary" className="ml-auto">
              {uploadedCount}/{documents.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc, index) => (
              <div
                key={index}
                className={`relative border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer hover:border-primary/50 ${
                  doc.file || doc.savedFilePath ? "border-green-500/50 bg-green-500/5" : "border-border"
                }`}
                onClick={() => fileInputRefs.current[index]?.click()}
              >
                <input
                  ref={(el) => (fileInputRefs.current[index] = el)}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="hidden"
                  onChange={(e) => handleFileSelect(index, e.target.files?.[0] || null)}
                />
                {doc.file ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{doc.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(doc.file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileSelect(index, null);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : doc.savedFilePath ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium truncate">{doc.savedFileName || doc.label}</p>
                      <p className="text-xs text-muted-foreground">Previously uploaded • click to replace</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDocuments((prev) =>
                          prev.map((d, i) => i === index ? { ...d, savedFilePath: undefined, savedFileName: undefined } : d)
                        );
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm font-medium">{doc.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                    {doc.required && (
                      <Badge variant="outline" className="mt-2 text-xs">
                        Required
                      </Badge>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* AI Notes */}
          <div className="mt-6">
            <Label htmlFor="ai-notes" className="flex items-center gap-2 mb-2">
              <StickyNote className="w-4 h-4" />
              Notes for AI
            </Label>
            <Textarea
              id="ai-notes"
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              placeholder="Add any additional context, corrections, or instructions for the AI to consider when generating the analysis..."
              rows={4}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional — these notes will be included as additional context for the analysis.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={handleStartChat}
              disabled={generating || chatMode}
              className="flex-1"
            >
              {generating && !chatMode ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {progressMessage || "Processing..."}
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Review & Generate Analysis
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chat Q&A Section */}
      {chatMode && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              AI Document Review
              <Badge variant="secondary" className="ml-auto">Q&A</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              The AI is reviewing your documents and may ask clarifying questions. Answer them to improve the analysis, or skip ahead.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              ref={chatScrollRef}
              className="max-h-[400px] overflow-y-auto space-y-3 p-3 bg-muted/30 rounded-lg border"
            >
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border text-card-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatStreaming && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-card border rounded-lg px-4 py-2.5 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChatMessage()}
                placeholder="Type your response..."
                disabled={chatStreaming || generating}
                className="flex-1"
              />
              <Button
                onClick={handleSendChatMessage}
                disabled={!chatInput.trim() || chatStreaming || generating}
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleFinalGenerate}
                disabled={generating || chatStreaming}
                className="flex-1"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {progressMessage || "Generating..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Final Analysis
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setChatMode(false); setChatMessages([]); }}
                disabled={generating}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previously Saved Documents */}
      {!loadingSaved && savedFiles.filter(f => f.file_type === 'source_doc').length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Saved Documents
              <Badge variant="secondary" className="ml-auto">
                {savedFiles.filter(f => f.file_type === 'source_doc').length} files
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedFiles.filter(f => f.file_type === 'source_doc').map((file) => (
                <div key={file.id} className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{file.document_label || file.file_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(file.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const { data } = await supabase.storage.from("market-analysis-docs").createSignedUrl(file.file_path, 300);
                      if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                    }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {generating && !chatMode && (
        <Card className="border-primary/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="font-medium">{progressMessage || "Processing..."}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden graphic renderers */}
      {pricing && (
        <div style={{ position: "absolute", left: "-9999px", top: 0, zIndex: -1, overflow: "visible" }}>
          <BullseyeGraphic
            ref={bullseyeRef}
            address={prop?.address ? `${prop.address}, ${prop.city}` : ""}
            bullseyePrice={pricing.bullseyePrice || ""}
            lowerBracketPrice={pricing.lowerBracketPrice || ""}
            upperBracketPrice={pricing.upperBracketPrice || ""}
            bullseyeBracketLabel={pricing.bullseyeBracketLow && pricing.bullseyeBracketHigh ? formatBracketLabel(pricing.bullseyeBracketLow, pricing.bullseyeBracketHigh) : ""}
            lowerBracketLabel={pricing.lowerBracketLow && pricing.lowerBracketHigh ? formatBracketLabel(pricing.lowerBracketLow, pricing.lowerBracketHigh) : ""}
            upperBracketLabel={pricing.upperBracketLow && pricing.upperBracketHigh ? formatBracketLabel(pricing.upperBracketLow, pricing.upperBracketHigh) : ""}
            lowerBracketDescription="This would be the dream come true price which would mean you are getting one heck of a deal. This does not happen very often."
          />
        </div>
      )}
      {prop?.zestimate && (
        <div style={{ position: "absolute", left: "-9999px", top: 0, zIndex: -1, overflow: "visible" }}>
          <ZillowGraphic
            ref={zillowRef}
            address={prop.address ? `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}` : ""}
            zestimate={prop.zestimate || ""}
            zestimateRange={prop.zestimateRange || ""}
            rentZestimate={prop.zestimateRent || ""}
            pricePerSqFt={prop.zestimatePsf || ""}
            zillowBeds={prop.zillowBeds || ""}
            zillowBaths={prop.zillowBaths || ""}
            propertyType="Single Family"
            yearBuilt={prop.yearBuilt || ""}
            updatedMonth={prop.zillowUpdatedMonth || ""}
            appreciation10yr={prop.zillowAppreciation10yr || ""}
            importantContext={analysis?.narrative?.zillowContextNote || ""}
          />
        </div>
      )}

      {/* Analysis Preview */}
      {analysis && !generating && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Analysis Preview
            </h4>
            <div className="flex gap-2">
              <Button onClick={handleDownload} variant="default">
                <Download className="w-4 h-4 mr-2" />
                Download .docx
              </Button>
            </div>
          </div>

          {/* Property Overview */}
          {prop && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Property Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-1 text-sm">
                  {[
                    ["Address", `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}`],
                    ["Owner(s)", [prop.owner1, prop.owner2].filter(Boolean).join(" and ")],
                    ["Style", prop.style],
                    ["Beds / Baths", `${prop.bedrooms} / ${prop.baths}`],
                    ["Above-Grade Sq Ft", prop.aboveGradeSqFt],
                    ["Basement Sq Ft", prop.basementSqFt],
                    ["Total Finished Sq Ft", prop.totalFinishedSqFt],
                    ["Year Built", prop.yearBuilt],
                    ["Zestimate", prop.zestimate],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex border-b border-border/50 py-1.5">
                      <span className="w-48 shrink-0 font-medium text-muted-foreground">{label}</span>
                      <span>{String(value || "-")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notable Features */}
          {analysis.features?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Notable Property Features</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {analysis.features.map((f: string, i: number) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Comparable Sales */}
          {analysis.closedComps?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Recent Comparable Sales</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#CC0000] text-white">
                      <th className="px-2 py-1.5 text-left">Address</th>
                      <th className="px-2 py-1.5 text-left">Closed</th>
                      <th className="px-2 py-1.5 text-right">List Price</th>
                      <th className="px-2 py-1.5 text-right">Sold Price</th>
                      <th className="px-2 py-1.5 text-center">Beds</th>
                      <th className="px-2 py-1.5 text-center">Baths</th>
                      <th className="px-2 py-1.5 text-right">Sq Ft</th>
                      <th className="px-2 py-1.5 text-center">Year</th>
                      <th className="px-2 py-1.5 text-right">DOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.closedComps.map((comp: any, i: number) => (
                      <tr key={i} className={i % 2 === 1 ? "bg-[#FDECEA]" : ""}>
                        <td className="px-2 py-1.5">{comp.address}</td>
                        <td className="px-2 py-1.5">{comp.closedDate}</td>
                        <td className="px-2 py-1.5 text-right">{comp.listPrice}</td>
                        <td className="px-2 py-1.5 text-right">{comp.soldPrice}</td>
                        <td className="px-2 py-1.5 text-center">{comp.beds}</td>
                        <td className="px-2 py-1.5 text-center">{comp.baths}</td>
                        <td className="px-2 py-1.5 text-right">{comp.sqFt}</td>
                        <td className="px-2 py-1.5 text-center">{comp.yearBuilt}</td>
                        <td className="px-2 py-1.5 text-right">{comp.dom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Pricing Strategy */}
          {pricing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">
                  Bullseye Pricing Strategy
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-8 py-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Lower Bracket</p>
                    <p className="text-lg font-semibold">{pricing.lowerBracketPrice}</p>
                  </div>
                  <div className="text-center bg-[#FDECEA] rounded-lg p-4 border-2 border-[#CC0000]">
                    <p className="text-xs font-medium text-[#CC0000]">★ BULLSEYE</p>
                    <p className="text-2xl font-bold text-[#8B0000]">{pricing.bullseyePrice}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Upper Bracket</p>
                    <p className="text-lg font-semibold">{pricing.upperBracketPrice}</p>
                  </div>
                </div>
                {analysis.narrative?.priceJustification && (
                  <p className="text-sm text-muted-foreground">
                    {analysis.narrative.priceJustification}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Graphics Preview */}
          {(bullseyeImage || zillowImage) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  Generated Graphics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bullseyeImage && (
                    <div>
                      <p className="text-xs font-medium mb-2">Bullseye Pricing Model</p>
                      <img src={bullseyeImage} alt="Bullseye Pricing Model" className="w-full rounded border" />
                    </div>
                  )}
                  {zillowImage && (
                    <div>
                      <p className="text-xs font-medium mb-2">Zillow Zestimate Card</p>
                      <img src={zillowImage} alt="Zillow Zestimate" className="w-full rounded border" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Next Steps */}
          {analysis.narrative?.nextSteps && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-[#8B0000]">Next Steps</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{analysis.narrative.nextSteps}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default BuyerMarketAnalysisTab;
