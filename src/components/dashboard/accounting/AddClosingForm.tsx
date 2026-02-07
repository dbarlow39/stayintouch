import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAgentsList } from "./useAgentsList";

interface AddClosingFormProps {
  onBack: () => void;
}

const AddClosingForm = ({ onBack }: AddClosingFormProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: agentOptions = [] } = useAgentsList();
  const [saving, setSaving] = useState(false);

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
    notes: "",
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const companyPct = parseFloat(form.company_split_pct) || 0;
  const agentPct = parseFloat(form.agent_split_pct) || 0;
  const totalCheck = parseFloat(form.total_check) || 0;
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
      const { error } = await supabase.from("closings").insert({
        agent_id: user.id,
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
        notes: form.notes,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success("Closing logged successfully—you're almost there.");
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      onBack();
    } catch (err: any) {
      toast.error(err.message || "Failed to save closing");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="mb-2">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Button>

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-medium">Add New Closing</CardTitle>
          <CardDescription>Enter the closing details. We'll calculate the split for you.</CardDescription>
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
              <Input value={form.property_address} onChange={e => update("property_address", e.target.value)} placeholder="123 Main St" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={form.city} onChange={e => update("city", e.target.value)} placeholder="Columbus" />
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
              <Input type="number" value={form.sale_price} onChange={e => update("sale_price", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Total Check</Label>
              <Input type="number" value={form.total_check} onChange={e => update("total_check", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Admin Fee</Label>
              <Input type="number" value={form.admin_fee} onChange={e => update("admin_fee", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Total Commission</Label>
              <div className="flex items-center h-10 px-3 rounded-md border bg-muted/30 text-sm font-medium">
                {formatCurrency(totalCommission)}
              </div>
            </div>
          </div>

          {/* Caliber Title Bonus */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="caliber_title_add"
                checked={form.caliber_title_bonus}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, caliber_title_bonus: !!checked }))}
              />
              <Label htmlFor="caliber_title_add" className="cursor-pointer">Caliber Title Bonus</Label>
            </div>
            {form.caliber_title_bonus && (
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Amount:</Label>
                <Input
                  type="number"
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
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} placeholder="Optional notes about this closing..." rows={3} />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onBack}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[hsl(220,13%,38%)] hover:bg-[hsl(220,13%,30%)] text-white">
              {saving ? "Saving..." : "Log Closing"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddClosingForm;
