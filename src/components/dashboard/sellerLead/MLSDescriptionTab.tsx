import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sparkles, Wand2, Copy, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  leadId: string;
  initialDescription?: string | null;
  onSaved?: (text: string) => void;
}

const MAX_CHARS = 1000;

const MLSDescriptionTab = ({ leadId, initialDescription, onSaved }: Props) => {
  const { toast } = useToast();
  const [description, setDescription] = useState(initialDescription || "");
  const [generating, setGenerating] = useState(false);
  const [tweaking, setTweaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [tweakInstruction, setTweakInstruction] = useState("");
  const dirtyRef = useRef(false);

  useEffect(() => {
    setDescription(initialDescription || "");
  }, [initialDescription, leadId]);

  const charCount = description.length;
  const overLimit = charCount > MAX_CHARS;

  const streamFromFunction = async (fnName: string, body: any, onDelta: (s: string) => void) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!resp.ok || !resp.body) {
      let msg = `Request failed (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch {}
      throw new Error(msg);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let done = false;
    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { done = true; break; }
        try {
          const p = JSON.parse(json);
          const c = p.choices?.[0]?.delta?.content;
          if (c) onDelta(c);
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setDescription("");
    let acc = "";
    try {
      await streamFromFunction("generate-mls-description", { leadId }, (chunk) => {
        acc += chunk;
        setDescription(acc);
      });
      // Auto-save
      await saveDescription(acc);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleTweak = async () => {
    if (!tweakInstruction.trim()) return;
    setTweaking(true);
    let acc = "";
    const original = description;
    try {
      setDescription("");
      await streamFromFunction("tweak-mls-description", { currentText: original, instruction: tweakInstruction }, (chunk) => {
        acc += chunk;
        setDescription(acc);
      });
      setTweakOpen(false);
      setTweakInstruction("");
      await saveDescription(acc);
    } catch (e: any) {
      toast({ title: "Tweak failed", description: e.message, variant: "destructive" });
      setDescription(original);
    } finally {
      setTweaking(false);
    }
  };

  const saveDescription = async (text: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("leads").update({ mls_description: text }).eq("id", leadId);
      if (error) throw error;
      dirtyRef.current = false;
      onSaved?.(text);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(description);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Write MLS Description
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a compelling MLS description using your Residential Work Sheet's AI summary, transcription, and photos. Stays under 1,000 characters and avoids em dashes. Saved automatically and persists between visits.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={generating || tweaking} className="bg-emerald-600 hover:bg-emerald-700">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {description ? "Regenerate" : "Generate MLS Description"}
            </Button>
            <Button onClick={() => setTweakOpen(true)} disabled={!description || generating || tweaking} variant="outline">
              <Wand2 className="w-4 h-4" />
              Tweak
            </Button>
            <Button onClick={handleCopy} disabled={!description} variant="outline">
              <Copy className="w-4 h-4" />
              Copy
            </Button>
            <Button
              onClick={() => saveDescription(description)}
              disabled={!description || saving || generating || tweaking}
              variant="outline"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>MLS Description</Label>
              <span className={`text-xs font-medium ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                {charCount} / {MAX_CHARS}
              </span>
            </div>
            <Textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); dirtyRef.current = true; }}
              onBlur={() => { if (dirtyRef.current) saveDescription(description); }}
              rows={14}
              placeholder="Click 'Generate MLS Description' to get started, then edit or use 'Tweak' to refine."
              className={overLimit ? "border-destructive focus-visible:ring-destructive" : ""}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={tweakOpen} onOpenChange={setTweakOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tweak MLS Description</DialogTitle>
            <DialogDescription>
              Tell the AI what to add, remove, or change. It will revise the current description while keeping the tone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Instruction</Label>
            <Textarea
              value={tweakInstruction}
              onChange={(e) => setTweakInstruction(e.target.value)}
              rows={4}
              placeholder='e.g. "Add a sentence about the finished basement" or "Remove the part about the backyard" or "Make it shorter and punchier"'
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTweakOpen(false)} disabled={tweaking}>Cancel</Button>
            <Button onClick={handleTweak} disabled={tweaking || !tweakInstruction.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {tweaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Apply Tweak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MLSDescriptionTab;
