import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Trash2, Phone, Mail, Asterisk, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";

interface BuyerLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-accent/10 text-accent-foreground border-accent/20",
  qualified: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  unqualified: "bg-destructive/10 text-destructive border-destructive/20",
  nurturing: "bg-secondary/50 text-secondary-foreground border-border",
};

const BuyersTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "OH",
    zip: "",
    status: "new",
    source: "",
    notes: "",
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["buyer-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("lead_type", "buyer")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BuyerLead[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newLead: typeof formData) => {
      const { data, error } = await supabase
        .from("leads")
        .insert([{
          ...newLead,
          agent_id: user?.id,
          lead_type: "buyer",
          status: newLead.status as "new" | "contacted" | "qualified" | "unqualified" | "nurturing",
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-leads"] });
      toast({ title: "Buyer lead created successfully" });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating buyer lead", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buyer-leads"] });
      toast({ title: "Buyer lead deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting buyer lead", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "OH",
      zip: "",
      status: "new",
      source: "",
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Buyer Lead CRM</h3>
          <p className="text-sm text-muted-foreground">Track buyer leads and manage follow-ups</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/daily-call-sheet")}>
            <ClipboardList className="w-4 h-4 mr-2" />
            Daily Call Sheet
          </Button>
          <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Buyer Lead
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Buyer Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="buyer_first_name" className="flex items-center gap-1">
                    First Name <Asterisk className="w-3 h-3 text-destructive" />
                  </Label>
                  <Input
                    id="buyer_first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_last_name" className="flex items-center gap-1">
                    Last Name <Asterisk className="w-3 h-3 text-destructive" />
                  </Label>
                  <Input
                    id="buyer_last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="buyer_email">Email</Label>
                  <Input
                    id="buyer_email"
                    type="text"
                    placeholder="email@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_phone">Phone</Label>
                  <Input
                    id="buyer_phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyer_address">Address</Label>
                <Input
                  id="buyer_address"
                  placeholder="Current address (optional)"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="buyer_city">City</Label>
                  <Input
                    id="buyer_city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_state">State</Label>
                  <Input
                    id="buyer_state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_zip">Zip</Label>
                  <Input
                    id="buyer_zip"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="buyer_status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="unqualified">Unqualified</SelectItem>
                      <SelectItem value="nurturing">Nurturing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buyer_source">Source</Label>
                  <Input
                    id="buyer_source"
                    placeholder="Website, Referral, etc."
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="buyer_notes">Notes</Label>
                <Textarea
                  id="buyer_notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Buyer Lead</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading buyer leads...</div>
      ) : !leads || leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No buyer leads yet. Add your first buyer lead to get started.</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/buyer-lead/${lead.id}`)}>
                  <TableCell className="font-medium">
                    {lead.first_name} {lead.last_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {lead.email && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[lead.status] || ""}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.source || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this buyer lead?")) {
                          deleteMutation.mutate(lead.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
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
};

export default BuyersTab;
