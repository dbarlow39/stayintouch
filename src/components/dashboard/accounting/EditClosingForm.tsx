import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useAgentsList } from "./useAgentsList";
import ClosingPaperworkUpload, { type PaperworkFile } from "./ClosingPaperworkUpload";
import ClosingPaperworkChecklist, { type ChecklistState, type ChecklistNAState } from "./ClosingPaperworkChecklist";
import ClosingNotificationDialog from "./ClosingNotificationDialog";

interface EditClosingFormProps {
  closingId: string;
  onBack: () => void;
}

const EditClosingForm = ({ closingId, onBack }: EditClosingFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: agentOptions = [] } = useAgentsList();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paperworkFiles, setPaperworkFiles] = useState<PaperworkFile[]>([]);
  const [representation, setRepresentation] = useState<"seller" | "buyer" | null>(null);
  const [builtBefore1978, setBuiltBefore1978] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [naState, setNAState] = useState<ChecklistNAState>({});
  const initialReceivedRef = useRef<{ paperwork: boolean; check: boolean } | null>(null);
  const [notifyDialog, setNotifyDialog] = useState<{ open: boolean; paperwork: boolean; check: boolean; agentEmail: string; agentName: string; address: string }>({
    open: false, paperwork: false, check: false, agentEmail: "", agentName: "", address: "",
  });

  const [form, setForm] = useState({
    agent_name: "",
    property_address: "",
    city: "",
    state: "OH",
    zip: "",
    closing_date: "",
    sale_price: "",
    total_check: "",
    admin_fee: "499",
    company_split_pct: "40",
    agent_split_pct: "60",
    caliber_title_bonus: true,
    caliber_title_amount: "150",
    check_received: false,
    paperwork_received: false,
    notes: "",
  });

  const { data: closing, isLoading } = useQuery({
    queryKey: ["closing-detail", closingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closings")
        .select("*")
        .eq("id", closingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!closingId,
  });

  useEffect(() => {
    if (closing) {
      const initialPaperwork = closing.paperwork_status === "received" || (Array.isArray((closing as any).paperwork_files) && (closing as any).paperwork_files.length > 0);
      const initialCheck = closing.status === "received";
      if (initialReceivedRef.current === null) {
        initialReceivedRef.current = { paperwork: initialPaperwork, check: initialCheck };
      }
      setForm({
        agent_name: closing.agent_name || "",
        property_address: closing.property_address || "",
        city: closing.city || "",
        state: closing.state || "OH",
        zip: closing.zip || "",
        closing_date: closing.closing_date || "",
        sale_price: String(closing.sale_price || ""),
        total_check: String(closing.total_commission || ""),
        admin_fee: String(closing.admin_fee ?? "499"),
        company_split_pct: String(closing.company_split_pct || "40"),
        agent_split_pct: String(closing.agent_split_pct || "60"),
        caliber_title_bonus: closing.caliber_title_bonus ?? true,
        caliber_title_amount: String(closing.caliber_title_amount ?? "150"),
        check_received: closing.status === "received",
        paperwork_received: closing.paperwork_status === "received",
        notes: closing.notes || "",
      });
      const existing = (closing as any).paperwork_files;
      if (Array.isArray(existing)) {
        setPaperworkFiles(existing as PaperworkFile[]);
      }
      const repr = (closing as any).representation;
      if (repr === "seller" || repr === "buyer") setRepresentation(repr);
      const savedChecklist = (closing as any).paperwork_checklist;
      if (savedChecklist && typeof savedChecklist === "object") {
        const { built_before_1978, ...rest } = savedChecklist as any;
        setBuiltBefore1978(!!built_before_1978);
        setChecklist(rest as ChecklistState);
      }
      const savedNA = (closing as any).paperwork_na;
      if (savedNA && typeof savedNA === "object") {
        setNAState(savedNA as ChecklistNAState);
      }
    }
  }, [closing]);

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const companyPct = parseFloat(form.company_split_pct) || 0;
  const agentPct = parseFloat(form.agent_split_pct) || 0;
  const salePrice = parseFloat(String(form.sale_price).replace(/,/g, "")) || 0;
  const calculatedCheck = salePrice > 0 ? Math.max(salePrice * 0.01, 2250) + 499 : 0;
  const totalCheck = form.total_check ? (parseFloat(String(form.total_check).replace(/,/g, "")) || 0) : calculatedCheck;
  const adminFee = parseFloat(form.admin_fee) || 0;
  const totalCommission = totalCheck - adminFee;
  const companyShare = totalCommission * (companyPct / 100);
  const agentShare = totalCommission * (agentPct / 100);
  const caliberAmount = form.caliber_title_bonus ? (parseFloat(form.caliber_title_amount) || 150) : 0;
  const agentCheckTotal = agentShare + caliberAmount;

  const handleSplitChange = (field: "company_split_pct" | "agent_split_pct", value: string) => {
    const num = parseFloat(value) || 0;
    if (field === "company_split_pct") {
      setForm(prev => ({ ...prev, company_split_pct: value, agent_split_pct: String(100 - num) }));
    } else {
      setForm(prev => ({ ...prev, agent_split_pct: value, company_split_pct: String(100 - num) }));
    }
  };

  const handleSave = async () => {
    if (!user || !form.agent_name || !form.property_address || !form.closing_date) {
      toast.error("Please fill in agent name, property address, and closing date.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("closings").update({
        agent_name: form.agent_name,
        property_address: form.property_address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        closing_date: form.closing_date,
        sale_price: parseFloat(form.sale_price) || 0,
        total_commission: totalCheck,
        admin_fee: adminFee,
        company_split_pct: companyPct,
        agent_split_pct: agentPct,
        company_share: companyShare,
        agent_share: agentShare,
        caliber_title_bonus: form.caliber_title_bonus,
        caliber_title_amount: caliberAmount > 0 ? caliberAmount : 150,
        status: form.check_received ? "received" : "not_received",
        paperwork_status: form.paperwork_received || paperworkFiles.length > 0 ? "received" : "not_received",
        notes: form.notes,
        paperwork_files: paperworkFiles as any,
        representation: representation,
        paperwork_checklist: { ...checklist, built_before_1978: builtBefore1978 } as any,
        paperwork_na: naState as any,
      }).eq("id", closingId);
      if (error) throw error;
      toast.success("Closing updated successfully.");
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      queryClient.invalidateQueries({ queryKey: ["closing-detail", closingId] });

      const nowPaperwork = form.paperwork_received || paperworkFiles.length > 0;
      const nowCheck = form.check_received;
      const init = initialReceivedRef.current || { paperwork: false, check: false };
      const paperworkTransition = nowPaperwork && !init.paperwork;
      const checkTransition = nowCheck && !init.check;
      if (paperworkTransition || checkTransition) {
        const agentRec = agentOptions.find(a => a.full_name === form.agent_name);
        setNotifyDialog({
          open: true,
          paperwork: paperworkTransition,
          check: checkTransition,
          agentEmail: (agentRec as any)?.email || "",
          agentName: form.agent_name,
          address: form.property_address,
        });
      } else {
        onBack();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to update closing");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("closings").delete().eq("id", closingId);
      if (error) throw error;
      toast.success("Closing deleted.");
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      onBack();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete closing");
    } finally {
      setDeleting(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this closing?</AlertDialogTitle>
              <AlertDialogDescription>This will permanently remove this closing and any linked checks. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground">
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Edit Closing</CardTitle>
          <CardDescription>Update closing details below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Agent Name *</Label>
              <Select value={form.agent_name} onValueChange={v => update("agent_name", v)}>
                <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
                <SelectContent>
                  {agentOptions.map(a => (
                    <SelectItem key={a.id} value={a.full_name}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Property Address *</Label>
              <Input value={form.property_address} onChange={e => update("property_address", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => update("city", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={form.state} onChange={e => update("state", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Zip</Label>
                <Input value={form.zip} onChange={e => update("zip", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Closing Date *</Label>
              <Input type="date" value={form.closing_date} onChange={e => update("closing_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sale Price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="pl-7"
                  value={(() => {
                    const raw = String(form.sale_price).replace(/,/g, "");
                    if (!raw) return "";
                    if (/\.$/.test(raw) || /\.\d{0,2}$/.test(raw)) {
                      const [intPart, decPart] = raw.split(".");
                      const intNum = Number(intPart);
                      const intFmt = isNaN(intNum) ? intPart : intNum.toLocaleString("en-US");
                      return decPart !== undefined ? `${intFmt}.${decPart}` : intFmt;
                    }
                    const num = Number(raw);
                    return isNaN(num) ? raw : num.toLocaleString("en-US");
                  })()}
                  onChange={e => {
                    let raw = e.target.value.replace(/[^0-9.]/g, "");
                    const firstDot = raw.indexOf(".");
                    if (firstDot !== -1) {
                      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
                      const [i, d] = raw.split(".");
                      raw = i + "." + (d ?? "").slice(0, 2);
                    }
                    update("sale_price", raw);
                  }}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Total Check</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="pl-7"
                  value={(() => {
                    const raw = String(form.total_check || (calculatedCheck > 0 ? String(calculatedCheck) : "")).replace(/,/g, "");
                    if (!raw) return "";
                    if (/\.$/.test(raw) || /\.\d{0,2}$/.test(raw)) {
                      const [intPart, decPart] = raw.split(".");
                      const intNum = Number(intPart);
                      const intFmt = isNaN(intNum) ? intPart : intNum.toLocaleString("en-US");
                      return decPart !== undefined ? `${intFmt}.${decPart}` : intFmt;
                    }
                    const num = Number(raw);
                    return isNaN(num) ? raw : num.toLocaleString("en-US");
                  })()}
                  onChange={e => {
                    let raw = e.target.value.replace(/[^0-9.]/g, "");
                    const firstDot = raw.indexOf(".");
                    if (firstDot !== -1) {
                      raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, "");
                      const [i, d] = raw.split(".");
                      raw = i + "." + (d ?? "").slice(0, 2);
                    }
                    update("total_check", raw);
                  }}
                  placeholder="Auto-calculated"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Admin Fee</Label>
              <Input type="number" step="0.01" value={form.admin_fee} onChange={e => update("admin_fee", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Total Commission</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted/30 text-sm font-medium">
                {formatCurrency(totalCommission)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="check_received"
                checked={form.check_received}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, check_received: !!checked }))}
              />
              <Label htmlFor="check_received" className="cursor-pointer">Check Received</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="paperwork_received"
                checked={form.paperwork_received}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, paperwork_received: !!checked }))}
              />
              <Label htmlFor="paperwork_received" className="cursor-pointer">Paperwork Received</Label>
            </div>
          </div>

          {/* Caliber Title Bonus */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="caliber_title"
                checked={form.caliber_title_bonus}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, caliber_title_bonus: !!checked }))}
              />
              <Label htmlFor="caliber_title" className="cursor-pointer">Caliber Title Bonus</Label>
            </div>
            {form.caliber_title_bonus && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Amount:</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.caliber_title_amount}
                  onChange={e => update("caliber_title_amount", e.target.value)}
                  className="w-28"
                />
              </div>
            )}
          </div>

          {/* Split Calculator */}
          <Card className="bg-muted/30 border-0">
            <CardContent className="pt-6">
              <h3 className="text-sm font-medium mb-4">Commission Split Preview</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <Label>Company %</Label>
                  <Input type="number" value={form.company_split_pct} onChange={e => handleSplitChange("company_split_pct", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Agent %</Label>
                  <Input type="number" value={form.agent_split_pct} onChange={e => handleSplitChange("agent_split_pct", e.target.value)} />
                </div>
              </div>
              <div className={`grid ${form.caliber_title_bonus ? 'grid-cols-3' : 'grid-cols-2'} gap-4 text-center`}>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Company Share</p>
                  <p className="text-lg font-semibold">{formatCurrency(companyShare)}</p>
                </div>
                <div className="bg-background rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-1">Agent Share</p>
                  <p className="text-lg font-semibold text-emerald-700">{formatCurrency(agentShare)}</p>
                </div>
                {form.caliber_title_bonus && (
                  <div className="bg-background rounded-lg p-4">
                    <p className="text-xs text-muted-foreground mb-1">Agent Check Total</p>
                    <p className="text-xs text-muted-foreground mb-1">(incl. Caliber Bonus)</p>
                    <p className="text-lg font-semibold text-emerald-700">{formatCurrency(agentCheckTotal)}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label>Representation</Label>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={representation === "seller"}
                  onCheckedChange={(checked) => setRepresentation(checked ? "seller" : null)}
                />
                <span className="text-sm">Representing Seller</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={representation === "buyer"}
                  onCheckedChange={(checked) => setRepresentation(checked ? "buyer" : null)}
                />
                <span className="text-sm">Representing Buyer</span>
              </label>
            </div>
          </div>

          <ClosingPaperworkUpload
            folderId={closingId}
            files={paperworkFiles}
            onChange={setPaperworkFiles}
            onUpload={(newFiles) => {
              if (newFiles.length > 0) {
                setForm(prev => ({ ...prev, paperwork_received: true }));
              }
            }}
            representation={representation}
          />

          <ClosingPaperworkChecklist
            representation={representation}
            builtBefore1978={builtBefore1978}
            onBuiltBefore1978Change={setBuiltBefore1978}
            checklist={checklist}
            onChange={setChecklist}
            naState={naState}
            onNAChange={setNAState}
          />

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onBack}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-700 hover:bg-emerald-600 text-white">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ClosingNotificationDialog
        open={notifyDialog.open}
        onClose={() => { setNotifyDialog(d => ({ ...d, open: false })); onBack(); }}
        agentName={notifyDialog.agentName}
        defaultEmail={notifyDialog.agentEmail}
        propertyAddress={notifyDialog.address}
        paperworkReceived={notifyDialog.paperwork}
        checkReceived={notifyDialog.check}
      />
    </div>
  );
};

export default EditClosingForm;
