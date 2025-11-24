import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, DollarSign, Calendar, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  close_date: string | null;
  property_address: string | null;
  notes: string | null;
  created_at: string;
}

const stages = [
  { value: "lead", label: "Lead", color: "bg-primary/10 text-primary border-primary/20" },
  { value: "qualified", label: "Qualified", color: "bg-accent/10 text-accent-foreground border-accent/20" },
  { value: "proposal", label: "Proposal", color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
  { value: "negotiation", label: "Negotiation", color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20" },
  { value: "closed_won", label: "Closed Won", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
  { value: "closed_lost", label: "Closed Lost", color: "bg-destructive/10 text-destructive border-destructive/20" },
];

const DealsTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    stage: "lead",
    value: "",
    close_date: "",
    property_address: "",
    notes: "",
  });

  const { data: deals, isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newDeal: any) => {
      const { data, error } = await supabase
        .from("deals")
        .insert([{ 
          ...newDeal, 
          agent_id: user?.id,
          value: newDeal.value ? parseFloat(newDeal.value) : null,
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast({ title: "Deal created successfully" });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating deal", description: error.message, variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("deals")
        .update({ stage: stage as "lead" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast({ title: "Deal stage updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating deal", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      stage: "lead",
      value: "",
      close_date: "",
      property_address: "",
      notes: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const getDealsByStage = (stage: string) => {
    return deals?.filter((deal) => deal.stage === stage) || [];
  };

  const calculateStageTotal = (stage: string) => {
    const stageDeals = getDealsByStage(stage);
    return stageDeals.reduce((sum, deal) => sum + (deal.value || 0), 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Sales Pipeline</h3>
          <p className="text-sm text-muted-foreground">Visualize and track your deals</p>
        </div>
        <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Deal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Deal Title *</Label>
                <Input
                  id="title"
                  placeholder="123 Main St - John Doe"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stage">Stage</Label>
                  <Select value={formData.stage} onValueChange={(value) => setFormData({ ...formData, stage: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Deal Value</Label>
                  <Input
                    id="value"
                    type="number"
                    placeholder="250000"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="property_address">Property Address</Label>
                  <Input
                    id="property_address"
                    placeholder="123 Main St, City, State"
                    value={formData.property_address}
                    onChange={(e) => setFormData({ ...formData, property_address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="close_date">Expected Close Date</Label>
                  <Input
                    id="close_date"
                    type="date"
                    value={formData.close_date}
                    onChange={(e) => setFormData({ ...formData, close_date: e.target.value })}
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
                <Button type="submit">Create Deal</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading pipeline...</div>
      ) : !deals || deals.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No deals yet. Create your first deal to start tracking.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stages.slice(0, 5).map((stage) => {
            const stageDeals = getDealsByStage(stage.value);
            const stageTotal = calculateStageTotal(stage.value);
            
            return (
              <Card key={stage.value} className="shadow-soft">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{stage.label}</CardTitle>
                    <Badge variant="outline" className="font-normal">
                      {stageDeals.length}
                    </Badge>
                  </div>
                  {stageTotal > 0 && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <DollarSign className="w-3 h-3" />
                      {stageTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {stageDeals.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No deals</p>
                  ) : (
                    stageDeals.map((deal) => (
                      <Card key={deal.id} className="p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                        <div className="space-y-2">
                          <h4 className="font-medium text-sm line-clamp-1">{deal.title}</h4>
                          {deal.value && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <DollarSign className="w-3 h-3" />
                              {deal.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </div>
                          )}
                          {deal.close_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="w-3 h-3" />
                              {new Date(deal.close_date).toLocaleDateString()}
                            </div>
                          )}
                          <Select
                            value={deal.stage}
                            onValueChange={(value) => updateStageMutation.mutate({ id: deal.id, stage: value })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stages.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </Card>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DealsTab;
