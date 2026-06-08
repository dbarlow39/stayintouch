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
import { peekNextCheckNumber, getNextCheckNumber, setCheckNumber } from "@/utils/checkNumberUtils";

interface VendorCheckPageProps {
  vendorId: string;
  vendorName: string;
  vendorAddress: string;
  vendorAttention: string;
  vendorCityStateZip: string;
  onBack: () => void;
}

interface PaymentFormData {
  amount: string;
  check_number: string;
  payment_date: string;
  description: string;
  notes: string;
  payee_name: string;
  payee_address: string;
  payee_city_state_zip: string;
}

const emptyPaymentForm: PaymentFormData = {
  amount: "",
  check_number: "",
  payment_date: new Date().toISOString().split("T")[0],
  description: "",
  notes: "",
  payee_name: "",
  payee_address: "",
  payee_city_state_zip: "",
};


const VendorCheckPage = ({ vendorId, vendorName, vendorAddress, vendorAttention, vendorCityStateZip, onBack }: VendorCheckPageProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PaymentFormData>(emptyPaymentForm);
  const isMisc = vendorName.trim().toUpperCase() === "MISC";



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
      // Get next check number if not manually overridden
      let checkNum = data.check_number;
      if (!checkNum) {
        checkNum = await getNextCheckNumber();
      } else {
        // Update counter to match manual entry so future checks increment from here
        await setCheckNumber(parseInt(checkNum, 10));
      }
      // For MISC vendor, store payee name in description so the ledger row tracks who got the check.
      const descriptionToSave = isMisc
        ? (data.payee_name ? `Pay To: ${data.payee_name}${data.description ? ` — ${data.description}` : ""}` : data.description)
        : (data.description || null);
      const { error } = await supabase.from("vendor_payments").insert({
        vendor_id: vendorId,
        created_by: user!.id,
        amount: parseFloat(data.amount),
        check_number: checkNum || null,
        payment_date: data.payment_date,
        description: descriptionToSave || null,
        notes: data.notes || null,
      });
      if (error) throw error;
      return {
        amount: parseFloat(data.amount),
        payment_date: data.payment_date,
        description: data.description,
        check_number: checkNum,
        payee_name: data.payee_name,
        payee_address: data.payee_address,
        payee_city_state_zip: data.payee_city_state_zip,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["vendor-payments", vendorId] });

      // Generate check PDF immediately
      const dateStr = format(new Date(result.payment_date + "T00:00:00"), "MMMM d, yyyy");
      const useMisc = isMisc && result.payee_name;
      generateCheckPdf({
        date: dateStr,
        totalAmount: result.amount,
        agentName: useMisc ? result.payee_name : vendorName,
        agentAddress: useMisc ? result.payee_address : vendorAddress,
        agentAttention: useMisc ? undefined : (vendorAttention || undefined),
        agentCityStateZip: useMisc ? result.payee_city_state_zip : vendorCityStateZip,
        propertyNames: result.description || "",
        lineItems: [{ amount: result.amount, label: result.description || "Payment" }],
        ytdTotal: payments.reduce((sum, p) => sum + Number(p.amount), 0) + result.amount,
        memo: form.notes || undefined,
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
    if (isMisc && !form.payee_name.trim()) {
      toast.error("Pay To (payee name) is required for MISC checks");
      return;
    }
    addPaymentMutation.mutate(form);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Build YTD running totals (ascending by date, then by check number)
  const sortedForYtd = [...payments].sort((a, b) => {
    const d = a.payment_date.localeCompare(b.payment_date);
    if (d !== 0) return d;
    const an = parseInt(a.check_number || "0", 10) || 0;
    const bn = parseInt(b.check_number || "0", 10) || 0;
    return an - bn;
  });
  let runningTotal = 0;
  const ytdMap = new Map<string, number>();
  for (const p of sortedForYtd) {
    runningTotal += Number(p.amount);
    ytdMap.set(p.id, runningTotal);
  }

  // For MISC ledger rows, extract payee name from description prefix "Pay To: {name}"
  const parseMiscPayee = (desc: string | null): { payee: string; rest: string } => {
    if (!desc) return { payee: "", rest: "" };
    const m = desc.match(/^Pay To:\s*([^—]+?)(?:\s+—\s+(.*))?$/);
    if (!m) return { payee: "", rest: desc };
    return { payee: m[1].trim(), rest: (m[2] || "").trim() };
  };

  const reprintCheckPdf = (payment: typeof payments[0]) => {
    const dateStr = format(new Date(payment.payment_date + "T00:00:00"), "MMMM d, yyyy");
    const amount = Number(payment.amount);
    const parsed = isMisc ? parseMiscPayee(payment.description) : { payee: "", rest: payment.description || "" };
    const useMisc = isMisc && parsed.payee;
    generateCheckPdf({
      date: dateStr,
      totalAmount: amount,
      agentName: useMisc ? parsed.payee : vendorName,
      agentAddress: useMisc ? "" : vendorAddress,
      agentAttention: useMisc ? undefined : (vendorAttention || undefined),
      agentCityStateZip: useMisc ? "" : vendorCityStateZip,
      propertyNames: (useMisc ? parsed.rest : payment.description) || "",
      lineItems: [{ amount, label: (useMisc ? parsed.rest : payment.description) || "Payment" }],
      ytdTotal: ytdMap.get(payment.id) || amount,
      memo: payment.notes || undefined,
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
        <Button size="sm" onClick={async () => { 
          const nextNum = await peekNextCheckNumber();
          setShowForm(true); 
          setForm({ ...emptyPaymentForm, check_number: nextNum }); 
        }}>
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
          {isMisc && (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Pay To (Payee Name) *</Label>
                <Input value={form.payee_name} onChange={(e) => setForm({ ...form, payee_name: e.target.value })} placeholder="John Smith" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payee Address</Label>
                <Input value={form.payee_address} onChange={(e) => setForm({ ...form, payee_address: e.target.value })} placeholder="123 Main St" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Payee City, State Zip</Label>
                <Input value={form.payee_city_state_zip} onChange={(e) => setForm({ ...form, payee_city_state_zip: e.target.value })} placeholder="Columbus, OH 43215" />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Description / Memo</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Monthly service" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Memo</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional memo" />
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
