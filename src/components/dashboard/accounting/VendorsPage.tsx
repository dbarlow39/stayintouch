import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Vendor {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

interface VendorPayment {
  id: string;
  vendor_id: string;
  amount: number;
  check_number: string | null;
  payment_date: string;
  description: string | null;
  notes: string | null;
}

interface VendorFormData {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  notes: string;
}

interface PaymentFormData {
  amount: string;
  check_number: string;
  payment_date: string;
  description: string;
  notes: string;
}

const emptyVendorForm: VendorFormData = { name: "", address: "", city: "", state: "", zip: "", phone: "", email: "", notes: "" };
const emptyPaymentForm: PaymentFormData = { amount: "", check_number: "", payment_date: new Date().toISOString().split("T")[0], description: "", notes: "" };

interface VendorsPageProps {
  onBack: () => void;
}

const VendorsPage = ({ onBack }: VendorsPageProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<VendorFormData>(emptyVendorForm);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(emptyPaymentForm);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!user,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["vendor-payments", selectedVendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_payments")
        .select("*")
        .eq("vendor_id", selectedVendor!.id)
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return data as VendorPayment[];
    },
    enabled: !!user && !!selectedVendor,
  });

  const addVendorMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const { error } = await supabase.from("vendors").insert({
        created_by: user!.id,
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        phone: data.phone || null,
        email: data.email || null,
        notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setForm(emptyVendorForm);
      setShowAddForm(false);
      toast.success("Vendor added");
    },
    onError: () => toast.error("Failed to add vendor"),
  });

  const updateVendorMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VendorFormData }) => {
      const { error } = await supabase.from("vendors").update({
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        phone: data.phone || null,
        email: data.email || null,
        notes: data.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      setEditingId(null);
      setForm(emptyVendorForm);
      toast.success("Vendor updated");
    },
    onError: () => toast.error("Failed to update vendor"),
  });

  const deleteVendorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      if (selectedVendor) setSelectedVendor(null);
      toast.success("Vendor removed");
    },
    onError: () => toast.error("Failed to remove vendor"),
  });

  const addPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const { error } = await supabase.from("vendor_payments").insert({
        vendor_id: selectedVendor!.id,
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
      queryClient.invalidateQueries({ queryKey: ["vendor-payments", selectedVendor?.id] });
      setPaymentForm(emptyPaymentForm);
      setShowPaymentForm(false);
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
      queryClient.invalidateQueries({ queryKey: ["vendor-payments", selectedVendor?.id] });
      toast.success("Payment removed");
    },
    onError: () => toast.error("Failed to remove payment"),
  });

  const startEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setShowAddForm(false);
    setForm({
      name: vendor.name,
      address: vendor.address || "",
      city: vendor.city || "",
      state: vendor.state || "",
      zip: vendor.zip || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      notes: vendor.notes || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAddForm(false);
    setForm(emptyVendorForm);
  };

  const handleSaveVendor = () => {
    if (!form.name.trim()) {
      toast.error("Vendor name is required");
      return;
    }
    if (editingId) {
      updateVendorMutation.mutate({ id: editingId, data: form });
    } else {
      addVendorMutation.mutate(form);
    }
  };

  const handleSavePayment = () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast.error("Amount is required");
      return;
    }
    addPaymentMutation.mutate(paymentForm);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const totalPayments = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  // Vendor payments detail view
  if (selectedVendor) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedVendor(null); setShowPaymentForm(false); }}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h3 className="text-lg font-medium">{selectedVendor.name} — Payments</h3>
            <p className="text-sm text-muted-foreground">
              {payments.length} payment{payments.length !== 1 ? "s" : ""} · Total: {formatCurrency(totalPayments)}
            </p>
          </div>
        </div>

        {!showPaymentForm && (
          <Button size="sm" onClick={() => { setShowPaymentForm(true); setPaymentForm(emptyPaymentForm); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Record Payment
          </Button>
        )}

        {showPaymentForm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg border">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount *</Label>
              <Input type="number" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Check Number</Label>
              <Input value={paymentForm.check_number} onChange={(e) => setPaymentForm({ ...paymentForm, check_number: e.target.value })} placeholder="1234" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Date</Label>
              <Input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={paymentForm.description} onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })} placeholder="Monthly service" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={handleSavePayment} disabled={addPaymentMutation.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowPaymentForm(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Check #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>{format(new Date(payment.payment_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{payment.description || "—"}</TableCell>
                    <TableCell>{payment.check_number || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(payment.amount))}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{payment.notes || "—"}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deletePaymentMutation.mutate(payment.id)}
                        disabled={deletePaymentMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  // Vendor list view
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">Manage Vendors</h3>
          <p className="text-sm text-muted-foreground">{vendors.length} vendor{vendors.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {!showAddForm && !editingId && (
        <Button size="sm" onClick={() => { setShowAddForm(true); setForm(emptyVendorForm); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
        </Button>
      )}

      {(showAddForm || editingId) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg border">
          <div className="space-y-1.5">
            <Label className="text-xs">Vendor Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ABC Services" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Columbus" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">State</Label>
            <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="OH" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Zip</Label>
            <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} placeholder="43215" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vendor@email.com" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
          </div>
          <div className="flex items-end gap-2">
            <Button size="sm" onClick={handleSaveVendor} disabled={addVendorMutation.isPending || updateVendorMutation.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {editingId ? "Update" : "Add"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
      ) : vendors.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No vendors yet. Add your first vendor to get started.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{vendor.address || "—"}</TableCell>
                  <TableCell>{vendor.city || "—"}</TableCell>
                  <TableCell>{vendor.state || "—"}</TableCell>
                  <TableCell>{vendor.phone || "—"}</TableCell>
                  <TableCell>{vendor.email || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(vendor)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => deleteVendorMutation.mutate(vendor.id)}
                        disabled={deleteVendorMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedVendor(vendor)}>
                        <DollarSign className="h-3.5 w-3.5 mr-1" /> Payments
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

export default VendorsPage;
