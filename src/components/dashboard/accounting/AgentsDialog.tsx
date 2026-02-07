import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";

interface Agent {
  id: string;
  full_name: string;
  home_address: string | null;
  phone: string | null;
  email: string | null;
  ssn: string | null;
}

interface AgentFormData {
  full_name: string;
  home_address: string;
  phone: string;
  email: string;
  ssn: string;
}

const emptyForm: AgentFormData = { full_name: "", home_address: "", phone: "", email: "", ssn: "" };

const AgentsDialog = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AgentFormData>(emptyForm);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["accounting-agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data as Agent[];
    },
    enabled: !!user && open,
  });

  const addMutation = useMutation({
    mutationFn: async (data: AgentFormData) => {
      const { error } = await supabase.from("agents").insert({
        created_by: user!.id,
        full_name: data.full_name,
        home_address: data.home_address || null,
        phone: data.phone || null,
        email: data.email || null,
        ssn: data.ssn || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-agents"] });
      setForm(emptyForm);
      setShowAddForm(false);
      toast.success("Agent added");
    },
    onError: () => toast.error("Failed to add agent"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AgentFormData }) => {
      const { error } = await supabase.from("agents").update({
        full_name: data.full_name,
        home_address: data.home_address || null,
        phone: data.phone || null,
        email: data.email || null,
        ssn: data.ssn || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-agents"] });
      setEditingId(null);
      setForm(emptyForm);
      toast.success("Agent updated");
    },
    onError: () => toast.error("Failed to update agent"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounting-agents"] });
      toast.success("Agent removed");
    },
    onError: () => toast.error("Failed to remove agent"),
  });

  const startEdit = (agent: Agent) => {
    setEditingId(agent.id);
    setShowAddForm(false);
    setForm({
      full_name: agent.full_name,
      home_address: agent.home_address || "",
      phone: agent.phone || "",
      email: agent.email || "",
      ssn: agent.ssn || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowAddForm(false);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      addMutation.mutate(form);
    }
  };

  const maskSSN = (ssn: string | null) => {
    if (!ssn) return "—";
    if (ssn.length >= 4) return `***-**-${ssn.slice(-4)}`;
    return "***";
  };

  const renderForm = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-muted/30 rounded-lg border">
      <div className="space-y-1.5">
        <Label className="text-xs">Full Name *</Label>
        <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Smith" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Home Address</Label>
        <Input value={form.home_address} onChange={(e) => setForm({ ...form, home_address: e.target.value })} placeholder="123 Main St, City, ST 12345" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Phone</Label>
        <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="agent@email.com" type="email" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Social Security Number</Label>
        <Input value={form.ssn} onChange={(e) => setForm({ ...form, ssn: e.target.value })} placeholder="123-45-6789" />
      </div>
      <div className="flex items-end gap-2">
        <Button size="sm" onClick={handleSave} disabled={addMutation.isPending || updateMutation.isPending}>
          <Save className="h-3.5 w-3.5 mr-1" />
          {editingId ? "Update" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={cancelEdit}>
          <X className="h-3.5 w-3.5 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Agent(s)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Agents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!showAddForm && !editingId && (
            <Button size="sm" onClick={() => { setShowAddForm(true); setForm(emptyForm); }}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Agent
            </Button>
          )}

          {(showAddForm || editingId) && renderForm()}

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No agents yet. Add your first agent to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>SSN</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium">{agent.full_name}</TableCell>
                      <TableCell className="max-w-[180px] truncate">{agent.home_address || "—"}</TableCell>
                      <TableCell>{agent.phone || "—"}</TableCell>
                      <TableCell>{agent.email || "—"}</TableCell>
                      <TableCell>{maskSSN(agent.ssn)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(agent)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteMutation.mutate(agent.id)}
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
      </DialogContent>
    </Dialog>
  );
};

export default AgentsDialog;
