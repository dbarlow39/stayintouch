import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sparkles, Wand2, Copy, Loader2, Save, Combine } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  leadId: string;
  initialDescription?: string | null;
  initialClaude?: string | null;
  initialFinal?: string | null;
  initialNotes?: string | null;
}

const MAX_CHARS = 1000;

type ColumnConfig = {
  title: string;
  subtitle: string;
  generateFn: string;
  tweakFn: string;
  column: "mls_description" | "mls_description_claude" | "mls_description_final";
  accent: string;
};

async function streamFromFunction(
  fnName: string,
  body: any,
  onDelta: (s: string) => void,
) {
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
}

interface ColumnPanelProps {
  leadId: string;
  config: ColumnConfig;
  value: string;
  setValue: (s: string) => void;
  // Custom generation handler (used by the Final column for combine actions);
  // when omitted we use config.generateFn.
  customActions?: React.ReactNode;
  showGenerate?: boolean;
  disabled?: boolean;
}

const ColumnPanel = ({ leadId, config, value, setValue, customActions, showGenerate = true, disabled = false }: ColumnPanelProps) => {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [tweaking, setTweaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [tweakInstruction, setTweakInstruction] = useState("");
  const dirtyRef = useRef(false);

  const charCount = value.length;
  const overLimit = charCount > MAX_CHARS;

  const saveValue = async (text: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("leads").update({ [config.column]: text }).eq("id", leadId);
      if (error) throw error;
      dirtyRef.current = false;
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setValue("");
    let acc = "";
    try {
      await streamFromFunction(config.generateFn, { leadId }, (chunk) => {
        acc += chunk;
        setValue(acc);
      });
      await saveValue(acc);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleTweak = async () => {
    if (!tweakInstruction.trim()) return;
    setTweaking(true);
    const original = value;
    let acc = "";
    try {
      setValue("");
      await streamFromFunction(config.tweakFn, { currentText: original, instruction: tweakInstruction }, (chunk) => {
        acc += chunk;
        setValue(acc);
      });
      setTweakOpen(false);
      setTweakInstruction("");
      await saveValue(acc);
    } catch (e: any) {
      toast({ title: "Tweak failed", description: e.message, variant: "destructive" });
      setValue(original);
    } finally {
      setTweaking(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied to clipboard" });
  };

  const busy = generating || tweaking;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className={`w-4 h-4 ${config.accent}`} />
          {config.title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{config.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-2">
          {showGenerate && (
            <Button onClick={handleGenerate} disabled={busy || disabled} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {value ? "Regenerate" : "Generate"}
            </Button>
          )}
          {customActions}
          <Button onClick={() => setTweakOpen(true)} disabled={!value || busy} size="sm" variant="outline">
            <Wand2 className="w-4 h-4" /> Tweak
          </Button>
          <Button onClick={handleCopy} disabled={!value} size="sm" variant="outline">
            <Copy className="w-4 h-4" /> Copy
          </Button>
          <Button onClick={() => saveValue(value)} disabled={!value || saving || busy} size="sm" variant="outline">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </Button>
        </div>

        <div className="space-y-2 flex-1 flex flex-col">
          <div className="flex items-center justify-between">
            <Label className="text-xs">MLS Description</Label>
            <span className={`text-xs font-medium ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
              {charCount} / {MAX_CHARS}
            </span>
          </div>
          <Textarea
            value={value}
            onChange={(e) => { setValue(e.target.value); dirtyRef.current = true; }}
            onBlur={() => { if (dirtyRef.current) saveValue(value); }}
            rows={26}
            placeholder={busy ? "Generating..." : "Click Generate to begin."}
            className={`flex-1 ${overLimit ? "border-destructive focus-visible:ring-destructive" : ""}`}
          />
        </div>
      </CardContent>

      <Dialog open={tweakOpen} onOpenChange={setTweakOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tweak {config.title}</DialogTitle>
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
              placeholder='e.g. "Add a sentence about the finished basement" or "Make it shorter"'
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTweakOpen(false)} disabled={tweaking}>Cancel</Button>
            <Button onClick={handleTweak} disabled={tweaking || !tweakInstruction.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {tweaking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

const MLSDescriptionTab = ({ leadId, initialDescription, initialClaude, initialFinal, initialNotes }: Props) => {
  const { toast } = useToast();
  const [gemini, setGemini] = useState(initialDescription || "");
  const [claude, setClaude] = useState(initialClaude || "");
  const [finalText, setFinalText] = useState(initialFinal || "");
  const [notes, setNotes] = useState(initialNotes || "");
  const [combiningWith, setCombiningWith] = useState<null | "gemini" | "claude">(null);
  const [facts, setFacts] = useState<{
    address?: string; city?: string; state?: string; zip?: string;
    bedrooms?: string | number; bathrooms?: string | number;
    sqft?: string | number; year_built?: string | number;
  } | null>(null);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesLoadedRef = useRef(false);

  useEffect(() => { setGemini(initialDescription || ""); }, [initialDescription, leadId]);
  useEffect(() => { setClaude(initialClaude || ""); }, [initialClaude, leadId]);
  useEffect(() => { setFinalText(initialFinal || ""); }, [initialFinal, leadId]);
  useEffect(() => { setNotes(initialNotes || ""); notesLoadedRef.current = true; }, [initialNotes, leadId]);

  // Debounced auto-save for the notes field
  useEffect(() => {
    if (!notesLoadedRef.current) return;
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from("leads").update({ mls_description_notes: notes || null } as any).eq("id", leadId);
      if (error) toast({ title: "Couldn't save notes", description: error.message, variant: "destructive" });
    }, 800);
    return () => { if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current); };
  }, [notes, leadId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: lead } = await supabase
        .from("leads")
        .select("address, city, state, zip, bedrooms, bathrooms, square_feet, year_built")
        .eq("id", leadId)
        .eq("agent_id", user.id)
        .maybeSingle();
      if (!lead) return;
      let inspection: any = null;
      if (lead.address) {
        const { data } = await supabase
          .from("inspections")
          .select("inspection_data")
          .eq("user_id", user.id)
          .ilike("property_address", `%${lead.address}%`)
          .order("updated_at", { ascending: false })
          .limit(1);
        inspection = data?.[0];
      }
      if (!inspection) {
        const { data } = await supabase
          .from("inspections")
          .select("inspection_data")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1);
        inspection = data?.[0];
      }
      const propInfo = (inspection?.inspection_data as any)?.["property-info"] || {};
      if (cancelled) return;
      setFacts({
        address: lead.address || propInfo.address,
        city: lead.city || propInfo.city,
        state: lead.state || propInfo.state,
        zip: lead.zip || propInfo.zip,
        bedrooms: (lead as any).bedrooms || propInfo.bedrooms,
        bathrooms: (lead as any).bathrooms || propInfo.bathrooms,
        sqft: (lead as any).square_feet || propInfo.sqft,
        year_built: (lead as any).year_built || propInfo.yearBuilt,
      });
    })();
    return () => { cancelled = true; };
  }, [leadId]);


  const saveFinal = async (text: string) => {
    try {
      await supabase.from("leads").update({ mls_description_final: text }).eq("id", leadId);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const handleCombine = async (model: "gemini" | "claude") => {
    if (!gemini && !claude) {
      toast({ title: "Generate at least one description first", description: "You need a Gemini or Claude version (ideally both) before combining.", variant: "destructive" });
      return;
    }
    setCombiningWith(model);
    setFinalText("");
    let acc = "";
    try {
      await streamFromFunction("combine-mls-descriptions", { gemini, claude, model, notes }, (chunk) => {
        acc += chunk;
        setFinalText(acc);
      });
      await saveFinal(acc);
    } catch (e: any) {
      toast({ title: "Combine failed", description: e.message, variant: "destructive" });
    } finally {
      setCombiningWith(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Write MLS Description
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate two AI-written MLS descriptions side by side, then merge the strongest elements of both into one final version. All three are saved automatically and persist between visits. Stays under 1,000 characters and avoids em dashes.
          </p>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Work Sheet facts the AI will consider
            </div>
            {facts ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm">
                {[
                  ["Address", facts.address],
                  ["City", facts.city],
                  ["State", facts.state],
                  ["Zip", facts.zip],
                  ["Bedrooms", facts.bedrooms],
                  ["Bathrooms", facts.bathrooms],
                  ["Square Footage", facts.sqft],
                  ["Year Built", facts.year_built],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-medium">{value ? String(value) : <span className="text-muted-foreground italic">—</span>}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground italic">Loading work sheet facts...</div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ColumnPanel
          leadId={leadId}
          config={{
            title: "Gemini 2.5 Pro",
            subtitle: "Google's flagship multimodal model. Reads all photos + work sheet.",
            generateFn: "generate-mls-description",
            tweakFn: "tweak-mls-description",
            column: "mls_description",
            accent: "text-blue-600",
          }}
          value={gemini}
          setValue={setGemini}
        />

        <ColumnPanel
          leadId={leadId}
          config={{
            title: "Claude Sonnet 4.5",
            subtitle: "Anthropic's storytelling specialist. Reads up to 20 photos + work sheet.",
            generateFn: "generate-mls-description-claude",
            tweakFn: "tweak-mls-description-claude",
            column: "mls_description_claude",
            accent: "text-orange-600",
          }}
          value={claude}
          setValue={setClaude}
        />

        <ColumnPanel
          leadId={leadId}
          config={{
            title: "Combined Final",
            subtitle: "Merge the best of both into one polished version.",
            generateFn: "combine-mls-descriptions",
            tweakFn: "tweak-mls-description",
            column: "mls_description_final",
            accent: "text-emerald-600",
          }}
          value={finalText}
          setValue={setFinalText}
          showGenerate={false}
          customActions={
            <>
              <Button
                onClick={() => handleCombine("gemini")}
                disabled={combiningWith !== null || (!gemini && !claude)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {combiningWith === "gemini" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Combine className="w-4 h-4" />}
                Combine w/ Gemini
              </Button>
              <Button
                onClick={() => handleCombine("claude")}
                disabled={combiningWith !== null || (!gemini && !claude)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {combiningWith === "claude" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Combine className="w-4 h-4" />}
                Combine w/ Claude
              </Button>
            </>
          }
        />
      </div>
    </div>
  );
};

export default MLSDescriptionTab;
