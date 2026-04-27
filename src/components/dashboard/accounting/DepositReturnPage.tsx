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
import {
  peekNextDepositReturnCheckNumber,
  getNextDepositReturnCheckNumber,
  setDepositReturnCheckNumber,
} from "@/utils/depositReturnCheckUtils";

interface DepositReturnPageProps {
  onBack: () => void;
}

interface FormData {
  payee_name: string;
  amount: string;
  check_number: string;
  check_date: string;
  property_address: string;
  notes: string;
}

const emptyForm: FormData = {
  payee_name: "",
  amount: "",
  check_number: "",
  check_date: new Date().toISOString().split("T")[0],
  property_address: "",
  notes: "",
};

const DepositReturnPage = ({ onBack }: DepositReturnPageProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);

  const { data: checks = [] } = useQuery({
    queryKey: ["deposit-return-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deposit_return_checks")
        .select("*")
        .order("check_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (data: FormData) => {
      let checkNum = data.check_number;
      if (!checkNum) {
        checkNum = await getNextDepositReturnCheckNumber();
      } else {
        await setDepositReturnCheckNumber(parseInt(checkNum, 10));
      }
      const { error } = await supabase.from("deposit_return_checks").insert({
        created_by: user!.id,
        payee_name: data.payee_name,
        amount: parseFloat(data.amount),
        check_number: checkNum || null,
        check_date: data.check_date,
        property_address: data.property_address || null,
        notes: data.notes || null,
      });
      if (error) throw error;
      return {
        amount: parseFloat(data.amount),
        check_date: data.check_date,
        payee_name: data.payee_name,
        property_address: data.property_address,
        check_number: checkNum,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["deposit-return-checks"] });
      const dateStr = format(new Date(result.check_date + "T00:00:00"), "MMMM d, yyyy");
      generateCheckPdf({
        date: dateStr,
        totalAmount: result.amount,
        agentName: result.payee_name,
        agentAddress: "",
        agentCityStateZip: "",
        propertyNames: result.property_address ? `Return of Deposit for: ${result.property_address}` : "Return of Deposit",
        lineItems: [{ amount: result.amount, label: "Return of Deposit" }],
        ytdTotal: checks.reduce((sum, c) => sum + Number(c.amount), 0) + result.amount,
        checkNumber: result.check_number,
      });
      setForm(emptyForm);
      setShowForm(false);
      toast.success("Check generated and recorded");
    },
    onError: () => toast.error("Failed to record check"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deposit_return_checks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deposit-return-checks"] });
      toast.success("Check removed");
    },
    onError: () => toast.error("Failed to remove check"),
  });

  const handleSave = () => {
    if (!form.payee_name.trim()) {
      toast.error("Payee name is required");
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error("Amount is required");
      return;
    }
    addMutation.mutate(form);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const total = checks.reduce((sum, c) => sum + Number(c.amount), 0);

  // YTD running totals (ascending by date)
  const sortedForYtd = [...checks].sort((a, b) => a.check_date.localeCompare(b.check_date));
  let runningTotal = 0;
  const ytdMap = new Map<string, number>();
  for (const c of sortedForYtd) {
    runningTotal += Number(c.amount);
    ytdMap.set(c.id, runningTotal);
  }

  const reprintCheckPdf = (chk: typeof checks[0]) => {
    const dateStr = format(new Date(chk.check_date + "T00:00:00"), "MMMM d, yyyy");
    const amount = Number(chk.amount);
    generateCheckPdf({
      date: dateStr,
      totalAmount: amount,
      agentName: chk.payee_name,
      agentAddress: "",
      agentCityStateZip: "",
      propertyNames: chk.property_address ? `Return of Deposit for: ${chk.property_address}` : "Return of Deposit",
      lineItems: [{ amount, label: "Return of Deposit" }],
      ytdTotal: ytdMap.get(chk.id) || amount,
      checkNumber: chk.check_number || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">Return Deposit Checks</h3>
          <p className="text-sm text-muted-foreground">
            {checks.length} check{checks.length !== 1 ? "s" : ""} · Total: {formatCurrency(total)}
          </p>
        </div>
      </div>

      {!showForm && (
        <Button
          size="sm"
          onClick={async () => {
            const nextNum = await peekNextDepositReturnCheckNumber();
            setShowForm(true);
            setForm({ ...emptyForm, check_number: nextNum });
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Write Return Deposit Check
        </Button>
      )}

      {showForm && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Pay to the Order Of *</Label>
            <Input
              value={form.payee_name}
              onChange={(e) => setForm({ ...form, payee_name: e.target.value })}
              placeholder="Buyer name"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Amount *</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Check Number</Label>
            <Input
              value={form.check_number}
              onChange={(e) => setForm({ ...form, check_number: e.target.value })}
              placeholder="1311"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Check Date</Label>
            <Input
              type="date"
              value={form.check_date}
              onChange={(e) => setForm({ ...form, check_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Property Address (Memo)</Label>
            <Input
              value={form.property_address}
              onChange={(e) => setForm({ ...form, property_address: e.target.value })}
              placeholder="123 Main St, Columbus OH"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Notes (internal log only)</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button size="sm" onClick={handleSave} disabled={addMutation.isPending}>
              <FileDown className="h-3.5 w-3.5 mr-1" /> Generate Check
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No return deposit checks recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Property (Memo)</TableHead>
                <TableHead>Check #</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">YTD Total</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((chk) => (
                <TableRow key={chk.id}>
                  <TableCell>{format(new Date(chk.check_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">{chk.payee_name}</TableCell>
                  <TableCell>{chk.property_address || "—"}</TableCell>
                  <TableCell>{chk.check_number || "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(chk.amount))}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(ytdMap.get(chk.id) || 0)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => reprintCheckPdf(chk)}
                        title="Re-print Check PDF"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteMutation.mutate(chk.id)}
                        disabled={deleteMutation.isPending}
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

export default DepositReturnPage;
