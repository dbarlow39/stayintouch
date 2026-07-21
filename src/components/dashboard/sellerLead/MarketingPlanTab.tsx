import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Download, X, Play, FileText, Trash2, RefreshCw, Wand2, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface UploadedDoc {
  id?: string;
  storage_path: string;
  filename: string;
  doc_type: string;
  local?: boolean;
}

const DOC_TYPES = [
  { value: "hoa_declaration", label: "HOA Declaration / Covenants" },
  { value: "hoa_bylaws", label: "HOA Bylaws" },
  { value: "hoa_rules", label: "HOA Rules & Regulations" },
  { value: "hoa_budget", label: "HOA Budget / Financials" },
  { value: "seller_disclosure", label: "Residential Property Disclosure" },
  { value: "lead_paint_disclosure", label: "Lead-Based Paint Disclosure" },
  { value: "survey", label: "Survey / Plat" },
  { value: "tax_bill", label: "Tax Bill" },
  { value: "inspection_report", label: "Prior Inspection Report" },
  { value: "warranty", label: "Warranty / Manuals" },
  { value: "other", label: "Other" },
];

const STAGE_LABELS: Record<string, string> = {
  property_data: "1. Property record (Estated)",
  photo_review: "2. Walkthrough photo review",
  document_facts: "3. Document facts (HOA/disclosures)",
  area_research: "4. Area research",
  marketing_plan: "5. Marketing plan",
};

export default function MarketingPlanTab({ lead }: { lead: any }) {
  const { toast } = useToast();
  const [existingJob, setExistingJob] = useState<any>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Setup form
  const [listPrice, setListPrice] = useState<string>("");
  const [targetDate, setTargetDate] = useState<string>("");
  const [unusualNotes, setUnusualNotes] = useState<string>("");
  const [mlsPaste, setMlsPaste] = useState<string>("");
  const [agentNotes, setAgentNotes] = useState<string>("");
  const [pendingDocs, setPendingDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState("hoa_declaration");

  // Running / result state
  const [results, setResults] = useState<Record<string, string>>({});
  const [planStream, setPlanStream] = useState<string>("");
  const [streamingPlan, setStreamingPlan] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [tweakInstruction, setTweakInstruction] = useState("");
  const [tweaking, setTweaking] = useState(false);
  const stage5Fired = useRef(false);

  // Agent profile - used to warn if the contact info that will land in the
  // plan's contact line is missing before the plan is generated.
  const [profileWarnings, setProfileWarnings] = useState<string[]>([]);

  // ---------- Load existing job ----------
  useEffect(() => {
    void loadLatestJob();
    void loadProfileWarnings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  async function loadProfileWarnings() {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    const { data: p } = await supabase
      .from("profiles")
      .select("preferred_email, cell_phone")
      .eq("id", uid)
      .maybeSingle();
    const w: string[] = [];
    if (!p?.preferred_email?.trim()) {
      w.push("Business email is missing on your Profile - the marketing plan will omit the email from your contact line until it's set.");
    }
    if (!p?.cell_phone?.trim()) {
      w.push("Cell phone is missing on your Profile - the marketing plan will omit the phone from your contact line until it's set.");
    }
    setProfileWarnings(w);
  }

  async function loadLatestJob() {
    setLoadingJob(true);
    const { data } = await supabase
      .from("marketing_plan_jobs")
      .select("*")
      .eq("seller_lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const j = data?.[0] || null;
    setExistingJob(j);
    if (j) await loadResults(j.id);
    setLoadingJob(false);
    if (!j) setShowSetup(true);
  }

  async function loadResults(jobId: string) {
    const { data } = await supabase
      .from("marketing_plan_results")
      .select("stage, content")
      .eq("job_id", jobId);
    const map: Record<string, string> = {};
    (data || []).forEach((r) => { map[r.stage] = r.content; });
    setResults(map);
    if (map.marketing_plan) setPlanStream(map.marketing_plan);
  }

  // ---------- Polling while running ----------
  useEffect(() => {
    if (!existingJob) return;
    if (existingJob.status === "complete" || existingJob.status === "failed") return;

    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("marketing_plan_jobs")
        .select("*")
        .eq("id", existingJob.id)
        .single();
      if (!data) return;
      setExistingJob(data);
      await loadResults(data.id);

      if (data.status === "ready_for_plan" && !stage5Fired.current) {
        stage5Fired.current = true;
        void runStage5(data.id);
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [existingJob?.id, existingJob?.status]);

  // ---------- Upload ----------
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Not authenticated");
      for (const f of files) {
        const path = `${uid}/${lead.id}/${Date.now()}-${f.name}`;
        const { error } = await supabase.storage.from("marketing-plan-docs").upload(path, f, {
          contentType: f.type || "application/pdf",
        });
        if (error) throw error;
        setPendingDocs((prev) => [
          ...prev,
          { storage_path: path, filename: f.name, doc_type: pendingDocType, local: true },
        ]);
      }
      toast({ title: "Uploaded", description: `${files.length} file(s) attached.` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removePendingDoc(idx: number) {
    const d = pendingDocs[idx];
    try {
      await supabase.storage.from("marketing-plan-docs").remove([d.storage_path]);
    } catch { /* ignore */ }
    setPendingDocs((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---------- Start job ----------
  async function handleStart() {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("marketing-plan-start", {
        body: {
          seller_lead_id: lead.id,
          list_price: listPrice ? Number(listPrice) : null,
          target_on_market_date: targetDate || null,
          unusual_notes: unusualNotes || null,
          mls_paste: mlsPaste || null,
          agent_notes: agentNotes || null,
          documents: pendingDocs.map((d) => ({
            storage_path: d.storage_path,
            doc_type: d.doc_type,
            filename: d.filename,
          })),
        },
      });
      if (error) throw error;
      toast({ title: "Marketing plan started", description: "Pipeline running — this takes a few minutes." });
      setShowSetup(false);
      setPendingDocs([]);
      stage5Fired.current = false;
      // Immediately reload the job so polling picks up.
      const jobId = (data as any)?.jobId;
      if (jobId) {
        const { data: j } = await supabase.from("marketing_plan_jobs").select("*").eq("id", jobId).single();
        setExistingJob(j);
      }
    } catch (err: any) {
      toast({ title: "Failed to start", description: err.message, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  // ---------- Stage 5 kickoff (backgrounded server-side; UI polls results) ----------
  async function runStage5(jobId: string) {
    setStreamingPlan(true);
    try {
      const { error } = await supabase.functions.invoke("marketing-plan-stage5-plan", {
        body: { jobId },
      });
      if (error) throw error;
      // Polling loop (already running) will pick up partial writes to
      // marketing_plan_results every ~2s and stream them into the UI.
    } catch (err: any) {
      toast({ title: "Plan generation failed to start", description: err.message, variant: "destructive" });
    } finally {
      setStreamingPlan(false);
    }
  }

  async function handleDownloadDocx() {
    if (!existingJob) return;
    setDownloadingDocx(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID;
      const fnUrl = `https://${projectId}.supabase.co/functions/v1/marketing-plan-export-docx`;
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: existingJob.id }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `marketing-plan-${lead.address || existingJob.id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingDocx(false);
    }
  }

  async function handleTweak() {
    if (!existingJob || !tweakInstruction.trim()) return;
    setTweaking(true);
    try {
      const { error } = await supabase.functions.invoke("marketing-plan-tweak", {
        body: { job_id: existingJob.id, instruction: tweakInstruction.trim() },
      });
      if (error) throw error;
      await loadResults(existingJob.id);
      setTweakInstruction("");
      toast({ title: "Plan updated", description: "Your requested change was applied." });
    } catch (err: any) {
      toast({ title: "Tweak failed", description: err.message, variant: "destructive" });
    } finally {
      setTweaking(false);
    }
  }

  async function handleReset() {
    if (!existingJob) return;
    // Best-effort cleanup — actual file removal is optional.
    await supabase.from("marketing_plan_jobs").delete().eq("id", existingJob.id);
    setExistingJob(null);
    setResults({});
    setPlanStream("");
    stage5Fired.current = false;
    setShowResetConfirm(false);
    setShowSetup(true);
    toast({ title: "Marketing plan cleared" });
  }

  async function handleRetryMissing() {
    if (!existingJob) return;
    const topics = ["schools","recreation","convenience","commute","community","demographics","market"];
    const missing = stages.filter((s) => !results[s]);
    if (missing.length === 0) {
      toast({ title: "Nothing to retry", description: "All stages have written results." });
      return;
    }
    try {
      await supabase
        .from("marketing_plan_jobs")
        .update({ status: "running", error: null, updated_at: new Date().toISOString() })
        .eq("id", existingJob.id);

      const invocations: Promise<any>[] = [];
      const invoked = new Set<string>();
      const invoke = (fn: string, body: any = { jobId: existingJob.id }) => {
        if (invoked.has(fn + JSON.stringify(body))) return;
        invoked.add(fn + JSON.stringify(body));
        invocations.push(supabase.functions.invoke(fn, { body }));
      };

      for (const s of missing) {
        if (s === "property_data") invoke("marketing-plan-stage1-property");
        else if (s === "photo_review") invoke("marketing-plan-stage2-photos");
        else if (s === "document_facts") invoke("marketing-plan-stage3-docs");
        else if (s.startsWith("area_")) invoke("marketing-plan-stage4-area");
        else if (s === "marketing_plan") invoke("marketing-plan-stage5-plan");
      }
      await Promise.allSettled(invocations);
      toast({ title: "Retrying", description: `Re-invoked ${missing.length} missing stage(s).` });
      await loadLatestJob();
    } catch (err: any) {
      toast({ title: "Retry failed", description: err.message, variant: "destructive" });
    }
  }

  async function handleSkipStage4() {
    if (!existingJob) return;
    try {
      await supabase.from("marketing_plan_results").upsert(
        {
          job_id: existingJob.id,
          stage: "area_research",
          content:
            "# Area Research (Stage 4)\n\n> Area research was skipped. Neighborhood claims are limited to what the uploaded documents and property record support.",
        },
        { onConflict: "job_id,stage" },
      );
      await supabase
        .from("marketing_plan_jobs")
        .update({
          current_stage: "marketing_plan",
          status: "ready_for_plan",
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingJob.id);
      stage5Fired.current = false;
      toast({ title: "Skipped area research", description: "Continuing to the marketing plan." });
      await loadLatestJob();
    } catch (err: any) {
      toast({ title: "Skip failed", description: err.message, variant: "destructive" });
    }
  }

  // ---------- Render ----------
  if (loadingJob) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  // Split seller-facing vs internal for display.
  // New format:     ---VERIFICATION---\n<internal>\n---PLAN---\n<seller>
  // Legacy format:  <seller>\n---INTERNAL---\n<internal>
  const splitPlan = (txt: string) => {
    const planIdx = txt.indexOf("---PLAN---");
    if (planIdx !== -1) {
      const before = txt.slice(0, planIdx);
      const seller = txt.slice(planIdx + "---PLAN---".length).trim();
      const internal = before.replace(/^---VERIFICATION---\s*/m, "").trim();
      return { seller, internal };
    }
    const legacyIdx = txt.indexOf("---INTERNAL---");
    if (legacyIdx !== -1) {
      return {
        seller: txt.slice(0, legacyIdx).trim(),
        internal: txt.slice(legacyIdx + "---INTERNAL---".length).trim(),
      };
    }
    return { seller: txt.trim(), internal: "" };
  };
  const planText = planStream || results.marketing_plan || "";
  const { seller: sellerFacing, internal: internalNotes } = splitPlan(planText);

  const stages = ["property_data", "photo_review", "document_facts", "area_research", "marketing_plan"];
  const status = existingJob?.status;
  const isRunning = existingJob && status !== "complete" && status !== "failed";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Marketing Plan</h2>
          <p className="text-sm text-muted-foreground">
            A homeowner-facing plan built from property data, walkthrough photos, uploaded documents, and area research.
          </p>
        </div>
        {existingJob && (
          <Button variant="outline" size="sm" onClick={() => setShowResetConfirm(true)}>
            <Trash2 className="w-4 h-4 mr-2" /> Start Over
          </Button>
        )}
      </div>

      {profileWarnings.length > 0 && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-700">
            <AlertTriangle className="w-4 h-4" /> Fix your Profile before sending this plan
          </div>
          <ul className="mt-1 list-disc pl-6 text-amber-800/90">
            {profileWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Setup panel */}
      {(showSetup || !existingJob) && (
        <Card>
          <CardHeader><CardTitle>Generate Marketing Plan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>List Price (optional)</Label>
                <Input type="number" value={listPrice} onChange={(e) => setListPrice(e.target.value)} placeholder="e.g. 425000" />
              </div>
              <div>
                <Label>Target On-Market Date (optional)</Label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Anything unusual we should know? (optional)</Label>
              <Textarea rows={3} value={unusualNotes} onChange={(e) => setUnusualNotes(e.target.value)}
                placeholder="Recent updates, seller motivations, quirks, etc." />
            </div>

            <div>
              <Label>Paste MLS data (optional but recommended)</Label>
              <Textarea rows={6} value={mlsPaste} onChange={(e) => setMlsPaste(e.target.value)}
                placeholder="Paste the full MLS sheet if available — this overrides Estated for sqft, year built, beds/baths, taxes." />
            </div>

            <div>
              <Label>Additional agent context (optional)</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Anything you know from talking to the seller or driving the property that isn't in a document — recent updates, neighbor history, buyer-attractive quirks, HOA verbal rules, etc. The plan will use these as agent assertions and list every one under "Agent-supplied, not documented" in the internal verification section.
              </p>
              <Textarea rows={4} value={agentNotes} onChange={(e) => setAgentNotes(e.target.value)}
                placeholder="e.g. Homeowner says the lot backs to a wooded common area; furnace replaced 2022 per homeowner (no receipt yet); HOA verbally allows short-term rentals under 30 days." />
            </div>

            <div className="border rounded-md p-4 space-y-3">
              <Label>Upload HOA docs, disclosures, surveys, tax bills…</Label>
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="border rounded px-2 py-1 text-sm bg-background"
                  value={pendingDocType}
                  onChange={(e) => setPendingDocType(e.target.value)}
                >
                  {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Add Files
                </Button>
              </div>
              {pendingDocs.length > 0 && (
                <ul className="text-sm space-y-1">
                  {pendingDocs.map((d, i) => (
                    <li key={i} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1">
                      <span className="truncate"><FileText className="w-3 h-3 inline mr-1" />{d.filename} <Badge variant="secondary" className="ml-2">{DOC_TYPES.find(t => t.value === d.doc_type)?.label || d.doc_type}</Badge></span>
                      <button onClick={() => removePendingDoc(i)} className="text-muted-foreground hover:text-destructive">
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={handleStart} disabled={starting} className="bg-primary text-primary-foreground">
                {starting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Generate Marketing Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress */}
      {existingJob && !showSetup && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pipeline Status</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={status === "complete" ? "default" : status === "failed" ? "destructive" : "secondary"}>
                {status}
              </Badge>
              {isRunning && <Loader2 className="w-4 h-4 animate-spin" />}
              <Button variant="ghost" size="icon" onClick={() => loadLatestJob()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {stages.map((s) => {
                const topics = ["schools","recreation","convenience","commute","community","demographics","market"];
                const areaCompleted = topics.filter((t) => !!results[`area_${t}`]).length;
                const done = s === "area_research"
                  ? areaCompleted >= 7 || !!results[s]
                  : !!results[s];
                // Parallel DAG: any stage without a result while the job is
                // still running is "in flight". current_stage is no longer set.
                const current = !done && isRunning;
                const showBatch = current && s === "photo_review" && (existingJob.current_batch ?? 0) > 0;
                let label = STAGE_LABELS[s];
                if (s === "area_research") {
                  label = `4. Area research (${Math.min(areaCompleted, 7)} of 7 complete)`;
                }
                return (
                  <li key={s} className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${done ? "bg-green-500" : current ? "bg-amber-500" : "bg-muted-foreground/30"}`} />
                    <span className={done ? "" : "text-muted-foreground"}>{label}</span>
                    {current && <span className="text-xs text-amber-600">(running…{showBatch ? ` batch ${existingJob.current_batch}` : ""})</span>}
                  </li>
                );
              })}
            </ol>
            {existingJob.error && (
              <p className="text-sm text-destructive mt-2">{existingJob.error}</p>
            )}
            {(() => {
              const topics = ["schools","recreation","convenience","commute","community","demographics","market"];
              const areaDone = topics.every((t) => !!results[`area_${t}`]);
              const missing = stages.filter((s) => s === "area_research" ? !areaDone && !results[s] : !results[s]);
              const stale = existingJob.updated_at
                && (Date.now() - new Date(existingJob.updated_at).getTime()) > 3 * 60 * 1000;
              if (!isRunning || !stale || missing.length === 0) return null;
              return (
                <div className="mt-3 p-2 rounded border border-amber-500/40 bg-amber-500/10 text-sm">
                  <p className="font-medium text-amber-700">This job appears to have stalled.</p>
                  <p className="text-xs text-muted-foreground mb-1">
                    No progress for over 3 minutes. Missing stages:
                  </p>
                  <ul className="text-xs text-muted-foreground mb-2 list-disc pl-5">
                    {missing.map((s) => (
                      <li key={s}>{STAGE_LABELS[s] || s}</li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" onClick={handleRetryMissing}>
                    <RefreshCw className="w-3 h-3 mr-2" /> Retry missing stages
                  </Button>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Tweak / revise panel */}
      {existingJob && status === "complete" && results.marketing_plan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wand2 className="w-4 h-4" /> Request Changes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tell the AI exactly what to change. It will rewrite only that part and leave the rest of the plan alone. Example: "In the Open House section, change the second sentence to say X" or "Recalculate savings using a $475,000 list price."
            </p>
            <Textarea
              rows={4}
              value={tweakInstruction}
              onChange={(e) => setTweakInstruction(e.target.value)}
              placeholder="Describe the change you want..."
              disabled={tweaking}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleTweak}
                disabled={tweaking || tweakInstruction.trim().length < 3}
              >
                {tweaking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                Apply Change
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {existingJob && (planText || Object.keys(results).length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Result</CardTitle>
            {sellerFacing && (
              <Button size="sm" onClick={handleDownloadDocx} disabled={downloadingDocx}>
                {downloadingDocx ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Export .docx
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="plan">
              <TabsList>
                <TabsTrigger value="plan">Marketing Plan {streamingPlan && <Loader2 className="w-3 h-3 ml-2 animate-spin" />}</TabsTrigger>
                <TabsTrigger value="internal">Internal Verification</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>
              <TabsContent value="plan" className="prose prose-sm max-w-none dark:prose-invert">
                {sellerFacing ? <ReactMarkdown>{sellerFacing}</ReactMarkdown> : <p className="text-muted-foreground text-sm">Waiting for the plan…</p>}
              </TabsContent>
              <TabsContent value="internal" className="prose prose-sm max-w-none dark:prose-invert">
                {internalNotes ? <ReactMarkdown>{internalNotes}</ReactMarkdown> : <p className="text-muted-foreground text-sm">Internal notes appear here once the plan finishes.</p>}
              </TabsContent>
              <TabsContent value="evidence" className="space-y-6">
                {["property_data", "photo_review", "document_facts", "area_research"].map((s) => (
                  <div key={s}>
                    <h3 className="font-semibold text-sm mb-1">{STAGE_LABELS[s]}</h3>
                    <div className="prose prose-sm max-w-none dark:prose-invert bg-muted/30 rounded p-3">
                      {results[s] ? <ReactMarkdown>{results[s]}</ReactMarkdown> : <p className="text-muted-foreground text-sm">Not yet available.</p>}
                    </div>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}




      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the current marketing plan job and its results. Uploaded documents in storage are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Delete & Start Over</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
