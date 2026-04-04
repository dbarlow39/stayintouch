import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles } from "lucide-react";

interface TweakMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnalysisTweakDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAnalysis: any;
  onRegenerate: (tweakInstructions: string) => Promise<void>;
  isRegenerating: boolean;
}

const AnalysisTweakDialog = ({
  open,
  onOpenChange,
  currentAnalysis,
  onRegenerate,
  isRegenerating,
}: AnalysisTweakDialogProps) => {
  const [tweakInput, setTweakInput] = useState("");
  const [messages, setMessages] = useState<TweakMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setTweakInput("");
    }
  }, [open]);

  const handleSubmitTweak = async () => {
    if (!tweakInput.trim() || isRegenerating) return;
    const instruction = tweakInput.trim();
    setMessages((prev) => [...prev, { role: "user", content: instruction }]);
    setTweakInput("");

    try {
      await onRegenerate(instruction);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Analysis has been regenerated with your changes. Check the updated preview below." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Failed to regenerate. Please try again." },
      ]);
    }
  };

  const pricingSummary = currentAnalysis?.pricing
    ? `Bullseye: ${currentAnalysis.pricing.bullseyePrice || "N/A"} | Lower: ${currentAnalysis.pricing.lowerBracketPrice || "N/A"} | Upper: ${currentAnalysis.pricing.upperBracketPrice || "N/A"}`
    : "No pricing data";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Tweak Analysis
          </DialogTitle>
          <DialogDescription>
            Describe what you'd like changed and the analysis will be regenerated.
          </DialogDescription>
        </DialogHeader>

        {/* Current analysis summary */}
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1 border">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Current Analysis</p>
          <p className="text-sm">{pricingSummary}</p>
          {currentAnalysis?.property?.address && (
            <p className="text-xs text-muted-foreground">
              {currentAnalysis.property.address}, {currentAnalysis.property.city}
            </p>
          )}
        </div>

        {/* Message history */}
        {messages.length > 0 && (
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 max-h-[250px] overflow-y-auto space-y-3 p-3 bg-muted/30 rounded-lg border"
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border text-card-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isRegenerating && (
              <div className="flex justify-start">
                <div className="bg-card border rounded-lg px-4 py-2.5 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  Regenerating analysis...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="space-y-3">
          <Textarea
            value={tweakInput}
            onChange={(e) => setTweakInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmitTweak();
              }
            }}
            placeholder="e.g. Raise the bullseye price to $425,000, remove comp #3, emphasize the new kitchen..."
            rows={3}
            disabled={isRegenerating}
            className="resize-none"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isRegenerating}
            >
              Close
            </Button>
            <Button
              onClick={handleSubmitTweak}
              disabled={!tweakInput.trim() || isRegenerating}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Regenerate
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AnalysisTweakDialog;
