import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Save, X, FileDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendor-payments", vendorId] });
      setForm(emptyPaymentForm);
      setShowForm(false);
      toast.success("Payment recorded");
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

  const numberToWords = (num: number): string => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
      "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    if (num === 0) return "Zero";
    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
      if (n < 1000000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + convert(n % 1000) : "");
      return convert(Math.floor(n / 1000000)) + " Million" + (n % 1000000 ? " " + convert(n % 1000000) : "");
    };
    const dollars = Math.floor(num);
    const cents = Math.round((num - dollars) * 100);
    const centsStr = cents.toString().padStart(2, "0");
    return `${convert(dollars)} and ${centsStr}/100`;
  };

  const generateVendorCheckPdf = (payment: typeof payments[0]) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const leftMargin = 50;
    const rightMargin = pageWidth - 50;
    let y = 69;

    const dateStr = format(new Date(payment.payment_date + "T00:00:00"), "MMMM d, yyyy");
    const amount = Number(payment.amount);

    // Date
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(dateStr, rightMargin, y, { align: "right" });

    y += 45;

    // Amount
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(`**${formatCurrency(amount)}`, rightMargin, y, { align: "right" });

    y += 14;

    // Written amount
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`${numberToWords(amount)} --------------`, pageWidth / 2, y, { align: "center" });

    y += 32;

    // Vendor name and address
    const addressX = 200;
    doc.setFontSize(12);
    doc.text(vendorName, addressX, y);
    if (vendorAddress) {
      y += 16;
      doc.text(vendorAddress, addressX, y);
    }
    if (vendorCityStateZip) {
      y += 16;
      doc.text(vendorCityStateZip, addressX, y);
    }

    y += 23;

    // Description / memo
    if (payment.description) {
      doc.setFontSize(10);
      doc.text(payment.description, leftMargin, y);
      y += 18;
    }

    if (payment.check_number) {
      doc.setFontSize(10);
      doc.text(`Check #${payment.check_number}`, leftMargin, y);
    }

    const fileName = `Vendor_Check_${vendorName.replace(/\s+/g, "_")}_${dateStr.replace(/[\s,]+/g, "_")}.pdf`;
    doc.save(fileName);
  };

  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Build YTD running totals (ascending by date)
  const sortedForYtd = [...payments].sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  let runningTotal = 0;
  const ytdMap = new Map<string, number>();
  for (const p of sortedForYtd) {
    runningTotal += Number(p.amount);
    ytdMap.set(p.id, runningTotal);
  }

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
              <Save className="h-3.5 w-3.5 mr-1" /> Save & Record
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
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => generateVendorCheckPdf(payment)} title="Print Check PDF">
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
