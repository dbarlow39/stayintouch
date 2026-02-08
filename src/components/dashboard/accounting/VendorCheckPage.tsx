import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, X, FileDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateCheckPdf } from "@/utils/generateCheckPdf";

interface VendorCheckPageProps {
  vendorId: string;
  vendorName: string;
  vendorAddress: string;
  vendorCityStateZip: string;
  onBack: () => void;
}

interface PaymentFormData {
  amount: string;
  check_number: string;
  payment_date: string;
  description: string;
  notes: string;
}

const emptyPaymentForm: PaymentFormData = {
  amount: "",
  check_number: "",
  payment_date: new Date().toISOString().split("T")[0],
  description: "",
  notes: "",
};

const VendorCheckPage = ({ vendorId, vendorName, vendorAddress, vendorCityStateZip, onBack }: VendorCheckPageProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PaymentFormData>(emptyPaymentForm);

  const { data: payments = [] } = useQuery({
    queryKey: ["vendor-payments", vendorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_payments")
        .select("*")
        .eq("vendor_id", vendorId)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const { error } = await supabase.from("vendor_payments").insert({
        vendor_id: vendorId,
        created_by: user!.id,
        amount: parseFloat(data.amount),
        check_number: data.check_number || null,
        payment_date: data.payment_date,
        description: data.description || null,
        notes: data.notes || null,
      });
      if (error) throw error;
      return { amount: parseFloat(data.amount), payment_date: data.payment_date, description: data.description, check_number: data.check_number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-payments", vendorId] });

      // Generate check PDF immediately
      const dateStr = format(new Date(result.payment_date + "T00:00:00"), "MMMM d, yyyy");
      generateCheckPdf({
        date: dateStr,
        totalAmount: result.amount,
        agentName: vendorName,
        agentAddress: vendorAddress,
        agentCityStateZip: vendorCityStateZip,
        propertyNames: result.description || "",
        lineItems: [{ amount: result.amount, label: result.description || "Payment" }],
        ytdTotal: payments.reduce((sum, p) => sum + Number(p.amount), 0) + result.amount,
      });

      setForm(emptyPaymentForm);
      setShowForm(false);
      toast.success("Check generated and payment recorded");
    },
    onError: () => toast.error("Failed to record payment"),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendor_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-payments", vendorId] });
      toast.success("Payment removed");
    },
    onError: () => toast.error("Failed to remove payment"),
  });

  const handleSave = () => {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error("Amount is required");
      return;
    }
    addPaymentMutation.mutate(form);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Build YTD running totals (ascending by date)
  const sortedForYtd = [...payments].sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  let runningTotal = 0;
  const ytdMap = new Map<string, number>();
  for (const p of sortedForYtd) {
    runningTotal += Number(p.amount);
    ytdMap.set(p.id, runningTotal);
  }

  const reprintCheckPdf = (payment: typeof payments[0]) => {
    const dateStr = format(new Date(payment.payment_date + "T00:00:00"), "MMMM d, yyyy");
    const amount = Number(payment.amount);
    generateCheckPdf({
      date: dateStr,
      totalAmount: amount,
      agentName: vendorName,
      agentAddress: vendorAddress,
      agentCityStateZip: vendorCityStateZip,
      propertyNames: payment.description || "",
      lineItems: [{ amount, label: payment.description || "Payment" }],
      ytdTotal: ytdMap.get(payment.id) || amount,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">{vendorName} — Checks & Payments</h3>
          <p className="text-sm text-muted-foreground">
            {payments.length} payment{payments.length !== 1 ? "s" : ""} · Total: {formatCurrency(totalPayments)}
          </p>
        </div>
      </div>

      {!showForm && (
        <Button size="sm" onClick={() => { setShowForm(true); setForm(emptyPaymentForm); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Write Check
        </Button>
      )}

      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="space-y-1.5">
            <Label className="text-xs">Amount *</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Check Number</Label>
            <Input value={form.check_number} onChange={(e) => setForm({ ...form, check_number: e.target.value })} placeholder="1234" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payment Date</Label>
            <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description / Memo</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Monthly service" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={handleSave} disabled={addPaymentMutation.isPending}>
              <FileDown className="h-3.5 w-3.5 mr-1" /> Generate Check
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No payments recorded yet. Write your first check above.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Check #</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">YTD Total</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>{format(new Date(payment.payment_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">{payment.description || "—"}</TableCell>
                  <TableCell>{payment.check_number || "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(payment.amount))}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(ytdMap.get(payment.id) || 0)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => reprintCheckPdf(payment)} title="Re-print Check PDF">
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deletePaymentMutation.mutate(payment.id)}
                        disabled={deletePaymentMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default VendorCheckPage;
