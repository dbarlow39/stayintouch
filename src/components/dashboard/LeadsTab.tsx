import { useState, useRef, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Trash2, Phone, Mail, Asterisk, Zap, Users, Settings2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import SequenceManager from "./SequenceManager";
import LeadEnrollmentDialog from "./LeadEnrollmentDialog";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  address: string | null;
  created_at: string;
}

const statusColors = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-accent/10 text-accent-foreground border-accent/20",
  qualified: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  unqualified: "bg-destructive/10 text-destructive border-destructive/20",
  nurturing: "bg-secondary/50 text-secondary-foreground border-border",
};

const LeadsTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [lookingUpAddress, setLookingUpAddress] = useState(false);
  const [addressSuggestion, setAddressSuggestion] = useState<{ address: string; city: string; state: string; zip: string; owner_name: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const lookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    address: "",
    first_name: "",
    last_name: "",
    city: "",
    state: "OH",
    zip: "",
    email: "",
    phone: "",
    status: "new",
    source: "",
    notes: "",
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newLead: typeof formData) => {
      const { data, error } = await supabase
        .from("leads")
        .insert([{ 
          ...newLead, 
          agent_id: user?.id,
          status: newLead.status as "new" | "contacted" | "qualified" | "unqualified" | "nurturing",
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead created successfully" });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating lead", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<typeof formData> }) => {
      const updateData = {
        ...updates,
        status: updates.status as "new" | "contacted" | "qualified" | "unqualified" | "nurturing" | undefined,
      };
      const { error } = await supabase.from("leads").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead updated successfully" });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error updating lead", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting lead", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      address: "",
      first_name: "",
      last_name: "",
      city: "",
      state: "OH",
      zip: "",
      email: "",
      phone: "",
      status: "new",
      source: "",
      notes: "",
    });
    setEditingLead(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLead) {
      updateMutation.mutate({ id: editingLead.id, updates: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormData({
      address: (lead as any).address || "",
      first_name: lead.first_name,
      last_name: lead.last_name,
      city: (lead as any).city || "",
      state: (lead as any).state || "OH",
      zip: (lead as any).zip || "",
      email: lead.email || "",
      phone: lead.phone || "",
      status: lead.status,
      source: lead.source || "",
      notes: lead.notes || "",
    });
    setOpen(true);
  };

  return (
    <Tabs defaultValue="leads" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Seller Lead CRM</h3>
          <p className="text-sm text-muted-foreground">Track seller leads with automated follow-ups</p>
        </div>
        <TabsList>
          <TabsTrigger value="leads">
            <Users className="w-4 h-4 mr-2" />
            Seller Leads
          </TabsTrigger>
          <TabsTrigger value="sequences">
            <Settings2 className="w-4 h-4 mr-2" />
            Sequences
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="leads" className="space-y-4">
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingLead ? "Edit Seller Lead" : "Add New Seller Lead"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2 relative" ref={suggestionsRef}>
                <Label htmlFor="address" className="flex items-center gap-1">
                  Property Address {lookingUpAddress && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </Label>
                <Input
                  id="address"
                  placeholder="Enter street address"
                  value={formData.address}
                  onChange={(e) => {
                    const address = e.target.value;
                    setFormData({ ...formData, address });
                    setAddressSuggestion(null);
                    setShowSuggestions(false);
                    if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
                    if (address.length > 10) {
                      lookupTimeoutRef.current = setTimeout(async () => {
                        setLookingUpAddress(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('lookup-property', {
                            body: { address, state: formData.state || 'OH' }
                          });
                          if (!error && data && !data.error && (data.city || data.zip || data.owner_name)) {
                            setAddressSuggestion({
                              address: address,
                              city: data.city || "",
                              state: data.state || "OH",
                              zip: data.zip || "",
                              owner_name: data.owner_name || "",
                            });
                            setShowSuggestions(true);
                          }
                        } catch (err) {
                          console.error("Address lookup error:", err);
                        } finally {
                          setLookingUpAddress(false);
                        }
                      }, 1000);
                    }
                  }}
                  onFocus={() => { if (addressSuggestion) setShowSuggestions(true); }}
                />
                {showSuggestions && addressSuggestion && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-accent/50 text-sm transition-colors"
                      onClick={() => {
                        const titleCase = (s: string) => s ? s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "";
                        const ownerName = addressSuggestion.owner_name;
                        const parts = ownerName.split(" ");
                        const firstName = parts[0] || "";
                        const lastName = parts.slice(1).join(" ") || "";
                        setFormData(prev => ({
                          ...prev,
                          first_name: prev.first_name || titleCase(firstName),
                          last_name: prev.last_name || titleCase(lastName),
                          city: titleCase(addressSuggestion.city) || prev.city,
                          state: addressSuggestion.state || prev.state,
                          zip: addressSuggestion.zip || prev.zip,
                        }));
                        setShowSuggestions(false);
                      }}
                    >
                      <div className="font-medium">{formData.address}</div>
                      <div className="text-xs text-muted-foreground">
                        {[addressSuggestion.city, addressSuggestion.state, addressSuggestion.zip].filter(Boolean).join(", ")}
                        {addressSuggestion.owner_name && ` • Owner: ${addressSuggestion.owner_name}`}
                      </div>
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name" className="flex items-center gap-1">
                    First Name <Asterisk className="w-3 h-3 text-destructive" />
                  </Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name" className="flex items-center gap-1">
                    Last Name <Asterisk className="w-3 h-3 text-destructive" />
                  </Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">Zip</Label>
                  <Input
                    id="zip"
                    value={formData.zip}
                    onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
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
                  <Label htmlFor="source">Source</Label>
                  <Input
                    id="source"
                    placeholder="Website, Referral, etc."
                    value={formData.source}
                    onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingLead ? "Update" : "Create"} Lead</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading leads...</div>
      ) : !leads || leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No leads yet. Add your first lead to get started.</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Sequences</TableHead>
                 <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleEdit(lead)}>
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
                  <TableCell>
                    <Badge className={statusColors[lead.status as keyof typeof statusColors]}>
                      {lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{lead.source || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <LeadEnrollmentDialog
                      leadId={lead.id}
                      leadName={`${lead.first_name} ${lead.last_name}`}
                      trigger={
                        <Button variant="outline" size="sm">
                          <Zap className="w-4 h-4 mr-1" />
                          Sequences
                        </Button>
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this lead?")) {
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
      </TabsContent>

      <TabsContent value="sequences">
        <SequenceManager />
      </TabsContent>
    </Tabs>
  );
};

export default LeadsTab;
