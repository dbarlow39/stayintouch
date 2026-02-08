import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";

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

const emptyForm: VendorFormData = { name: "", address: "", city: "", state: "", zip: "", phone: "", email: "", notes: "" };

interface VendorsPageProps {
  onBack: () => void;
  onNavigate: (view: string) => void;
}

const VendorsPage = ({ onBack, onNavigate }: VendorsPageProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<VendorFormData>(emptyForm);

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data as Vendor[];
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (data: VendorFormData) => {
      const { error } = await supabase.from("vendors").insert({
        created_by: user!.id, name: data.name,
        address: data.address || null, city: data.city || null, state: data.state || null,
        zip: data.zip || null, phone: data.phone || null, email: data.email || null, notes: data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); setForm(emptyForm); setShowAddForm(false); toast.success("Vendor added"); },
    onError: () => toast.error("Failed to add vendor"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VendorFormData }) => {
      const { error } = await supabase.from("vendors").update({
        name: data.name, address: data.address || null, city: data.city || null, state: data.state || null,
        zip: data.zip || null, phone: data.phone || null, email: data.email || null, notes: data.notes || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); setEditingId(null); setForm(emptyForm); toast.success("Vendor updated"); },
    onError: () => toast.error("Failed to update vendor"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vendors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["vendors"] }); toast.success("Vendor removed"); },
    onError: () => toast.error("Failed to remove vendor"),
  });

  const startEdit = (vendor: Vendor) => {
    setEditingId(vendor.id);
    setShowAddForm(false);
    setForm({ name: vendor.name, address: vendor.address || "", city: vendor.city || "", state: vendor.state || "", zip: vendor.zip || "", phone: vendor.phone || "", email: vendor.email || "", notes: vendor.notes || "" });
  };

  const cancelEdit = () => { setEditingId(null); setShowAddForm(false); setForm(emptyForm); };

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Vendor name is required"); return; }
    if (editingId) { updateMutation.mutate({ id: editingId, data: form }); }
    else { addMutation.mutate(form); }
  };

  const handleVendorClick = (vendor: Vendor) => {
    const addr = vendor.address || "";
    const csz = [vendor.city, vendor.state, vendor.zip].filter(Boolean).join(", ");
    onNavigate(`vendor-check:${vendor.id}:${vendor.name}:${addr}:${csz}`);
  };

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
        <Button size="sm" onClick={() => { setShowAddForm(true); setForm(emptyForm); }}>
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
            <Button size="sm" onClick={handleSave} disabled={addMutation.isPending || updateMutation.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" /> {editingId ? "Update" : "Add"}
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
        <p className="text-sm text-muted-foreground py-8 text-center">No vendors yet. Add your first vendor to get started.</p>
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
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id} className="cursor-pointer hover:bg-muted/40" onClick={() => handleVendorClick(vendor)}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="max-w-[180px] truncate">{vendor.address || "—"}</TableCell>
                  <TableCell>{vendor.city || "—"}</TableCell>
                  <TableCell>{vendor.state || "—"}</TableCell>
                  <TableCell>{vendor.phone || "—"}</TableCell>
                  <TableCell>{vendor.email || "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(vendor)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(vendor.id)} disabled={deleteMutation.isPending}>
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

export default VendorsPage;
