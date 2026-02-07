import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CheckLoggingProps {
  onBack: () => void;
}

const CheckLogging = ({ onBack }: CheckLoggingProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    closing_id: "",
    check_number: "",
    check_amount: "",
    payer_name: "",
    received_date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const { data: closings = [] } = useQuery({
    queryKey: ["accounting-closings-for-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closings")
        .select("*")
        .order("closing_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: checks = [] } = useQuery({
    queryKey: ["accounting-all-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closing_checks")
        .select("*, closings(property_address, agent_name)")
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!user || !form.closing_id || !form.check_amount) {
      toast.error("Please select a closing and enter the check amount.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("closing_checks").insert({
        closing_id: form.closing_id,
        check_number: form.check_number,
        check_amount: parseFloat(form.check_amount) || 0,
        payer_name: form.payer_name,
        received_date: form.received_date,
        notes: form.notes,
        created_by: user.id,
      });
      if (error) throw error;

      // Update closing status
      await supabase.from("closings").update({ status: "check_received" }).eq("id", form.closing_id);

      toast.success("Check logged successfully—you're almost there.");
      queryClient.invalidateQueries({ queryKey: ["accounting-all-checks"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-pending-checks"] });
      setShowForm(false);
      setForm({ closing_id: "", check_number: "", check_amount: "", payer_name: "", received_date: new Date().toISOString().split("T")[0], notes: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to log check");
    } finally {
      setSaving(false);
    }
  };

  const markDeposited = async (checkId: string) => {
    try {
      await supabase.from("closing_checks").update({ deposited: true, deposited_date: new Date().toISOString().split("T")[0] }).eq("id", checkId);
      toast.success("Check marked as deposited.");
      queryClient.invalidateQueries({ queryKey: ["accounting-all-checks"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-pending-checks"] });
    } catch {
      toast.error("Failed to update check.");
    }
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-medium">Check Logging</h2>
          <p className="text-sm text-muted-foreground">Log and track commission checks received</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="bg-[hsl(220,13%,38%)] hover:bg-[hsl(220,13%,30%)] text-white">
          <Plus className="w-4 h-4 mr-2" /> Log Check
        </Button>
      </div>

      {showForm && (
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-medium">Log New Check</CardTitle>
            <CardDescription>Enter check details and link to a closing</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Closing *</Label>
                <Select value={form.closing_id} onValueChange={v => update("closing_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select closing..." /></SelectTrigger>
                  <SelectContent>
                    {closings.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.property_address} — {c.agent_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Check Amount *</Label>
                <Input type="number" value={form.check_amount} onChange={e => update("check_amount", e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Check Number</Label>
                <Input value={form.check_number} onChange={e => update("check_number", e.target.value)} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <Label>Payer Name</Label>
                <Input value={form.payer_name} onChange={e => update("payer_name", e.target.value)} placeholder="Title company, buyer, etc." />
              </div>
              <div className="space-y-2">
                <Label>Date Received</Label>
                <Input type="date" value={form.received_date} onChange={e => update("received_date", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} rows={2} placeholder="Optional notes..." />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-[hsl(220,13%,38%)] hover:bg-[hsl(220,13%,30%)] text-white">
                {saving ? "Saving..." : "Log Check"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="pt-6">
          {checks.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No checks logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Check #</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((check: any) => (
                    <TableRow key={check.id}>
                      <TableCell className="font-medium">{check.closings?.property_address || "—"}</TableCell>
                      <TableCell>{check.closings?.agent_name || "—"}</TableCell>
                      <TableCell>{check.check_number || "—"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(check.check_amount))}</TableCell>
                      <TableCell>{format(new Date(check.received_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                      <TableCell>
                        <Badge className={`border-0 ${check.deposited ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {check.deposited ? "Deposited" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!check.deposited && (
                          <Button variant="ghost" size="sm" onClick={() => markDeposited(check.id)}>
                            <Check className="w-4 h-4 mr-1" /> Deposit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckLogging;
