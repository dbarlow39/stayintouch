import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Mail, MessageSquare, Sparkles, GripVertical, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface SequenceStep {
  id: string;
  step_order: number;
  delay_days: number;
  channel: "email" | "sms" | "both";
  subject: string | null;
  message_template: string;
  use_ai_enhancement: boolean;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  sequence_steps?: SequenceStep[];
}

const defaultSteps = [
  { delay_days: 1, channel: "email" as const, subject: "Thanks for your interest!", message_template: "Hi {first_name},\n\nThank you for reaching out about selling your home. I'd love to discuss your goals and how I can help you get the best price.\n\nWould you be available for a quick call this week?\n\nBest regards" },
  { delay_days: 3, channel: "sms" as const, subject: "", message_template: "Hi {first_name}, just following up on my email. Would love to chat about your home selling plans. When works best for a quick call?" },
  { delay_days: 7, channel: "email" as const, subject: "Market Update for Your Area", message_template: "Hi {first_name},\n\nI wanted to share some exciting market updates in your area. Homes are selling quickly and inventory is low.\n\nThis could be a great time to consider your options. I'm happy to provide a free home valuation if you're curious about your home's current market value.\n\nLet me know if you'd like to learn more!" },
  { delay_days: 14, channel: "both" as const, subject: "Still thinking about selling?", message_template: "Hi {first_name},\n\nI hope you're doing well! I wanted to check in and see if you're still thinking about selling your home.\n\nEven if you're not ready right now, I'm always here to answer questions or provide market insights.\n\nFeel free to reach out anytime!" },
];

const SequenceManager = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [newSequenceName, setNewSequenceName] = useState("");
  const [newSequenceDescription, setNewSequenceDescription] = useState("");
  const [editingSteps, setEditingSteps] = useState<Omit<SequenceStep, "id">[]>([]);

  const { data: sequences, isLoading } = useQuery({
    queryKey: ["follow-up-sequences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_up_sequences")
        .select(`*, sequence_steps(*)`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sequence[];
    },
  });

  const createSequenceMutation = useMutation({
    mutationFn: async ({ name, description, steps }: { name: string; description: string; steps: Omit<SequenceStep, "id">[] }) => {
      // Create the sequence
      const { data: sequence, error: seqError } = await supabase
        .from("follow_up_sequences")
        .insert([{ name, description, agent_id: user?.id }])
        .select()
        .single();
      if (seqError) throw seqError;

      // Create the steps
      if (steps.length > 0) {
        const stepsToInsert = steps.map((step, index) => ({
          sequence_id: sequence.id,
          step_order: index + 1,
          delay_days: step.delay_days,
          channel: step.channel,
          subject: step.subject || null,
          message_template: step.message_template,
          use_ai_enhancement: step.use_ai_enhancement || false,
        }));
        const { error: stepsError } = await supabase.from("sequence_steps").insert(stepsToInsert);
        if (stepsError) throw stepsError;
      }

      return sequence;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-sequences"] });
      toast({ title: "Sequence created successfully" });
      setCreateOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "Error creating sequence", description: error.message, variant: "destructive" });
    },
  });

  const updateSequenceMutation = useMutation({
    mutationFn: async ({ id, name, description, isActive }: { id: string; name?: string; description?: string; isActive?: boolean }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (isActive !== undefined) updates.is_active = isActive;
      
      const { error } = await supabase.from("follow_up_sequences").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-sequences"] });
      toast({ title: "Sequence updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating sequence", description: error.message, variant: "destructive" });
    },
  });

  const deleteSequenceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("follow_up_sequences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["follow-up-sequences"] });
      toast({ title: "Sequence deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting sequence", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setNewSequenceName("");
    setNewSequenceDescription("");
    setEditingSteps([]);
    setEditingSequence(null);
  };

  const handleCreateWithDefaults = () => {
    setEditingSteps(defaultSteps.map(s => ({ ...s, step_order: 0, use_ai_enhancement: true })));
    setNewSequenceName("Seller Lead Nurture");
    setNewSequenceDescription("Standard 14-day follow-up sequence for potential home sellers");
    setCreateOpen(true);
  };

  const handleAddStep = () => {
    setEditingSteps([...editingSteps, {
      step_order: editingSteps.length + 1,
      delay_days: 1,
      channel: "email",
      subject: "",
      message_template: "",
      use_ai_enhancement: false,
    }]);
  };

  const handleRemoveStep = (index: number) => {
    setEditingSteps(editingSteps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, field: keyof Omit<SequenceStep, "id">, value: unknown) => {
    const updated = [...editingSteps];
    updated[index] = { ...updated[index], [field]: value };
    setEditingSteps(updated);
  };

  const handleSubmit = () => {
    if (!newSequenceName.trim()) {
      toast({ title: "Please enter a sequence name", variant: "destructive" });
      return;
    }
    createSequenceMutation.mutate({
      name: newSequenceName,
      description: newSequenceDescription,
      steps: editingSteps,
    });
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email": return <Mail className="w-4 h-4" />;
      case "sms": return <MessageSquare className="w-4 h-4" />;
      case "both": return <><Mail className="w-4 h-4" /><MessageSquare className="w-4 h-4" /></>;
      default: return null;
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading sequences...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold">Follow-up Sequences</h4>
          <p className="text-sm text-muted-foreground">Automated email and SMS drip campaigns</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCreateWithDefaults}>
            <Sparkles className="w-4 h-4 mr-2" />
            Use Template
          </Button>
          <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Sequence
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Follow-up Sequence</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sequence Name</Label>
                    <Input
                      value={newSequenceName}
                      onChange={(e) => setNewSequenceName(e.target.value)}
                      placeholder="e.g., Seller Lead Nurture"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={newSequenceDescription}
                      onChange={(e) => setNewSequenceDescription(e.target.value)}
                      placeholder="Brief description of this sequence"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Sequence Steps</Label>
                    <Button type="button" variant="outline" size="sm" onClick={handleAddStep}>
                      <Plus className="w-4 h-4 mr-1" /> Add Step
                    </Button>
                  </div>

                  {editingSteps.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
                      No steps yet. Add steps or use a template.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {editingSteps.map((step, index) => (
                        <Card key={index} className="relative">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                <Badge variant="secondary">Day {step.delay_days}</Badge>
                                <div className="flex items-center gap-1">{getChannelIcon(step.channel)}</div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveStep(index)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <Label>Delay (days after enrollment)</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={step.delay_days}
                                  onChange={(e) => handleStepChange(index, "delay_days", parseInt(e.target.value) || 1)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Channel</Label>
                                <Select
                                  value={step.channel}
                                  onValueChange={(value) => handleStepChange(index, "channel", value)}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="email">Email Only</SelectItem>
                                    <SelectItem value="sms">SMS Only</SelectItem>
                                    <SelectItem value="both">Email & SMS</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                  <Sparkles className="w-4 h-4" /> AI Enhancement
                                </Label>
                                <div className="flex items-center gap-2 pt-2">
                                  <Switch
                                    checked={step.use_ai_enhancement}
                                    onCheckedChange={(checked) => handleStepChange(index, "use_ai_enhancement", checked)}
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    {step.use_ai_enhancement ? "Enabled" : "Disabled"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {(step.channel === "email" || step.channel === "both") && (
                              <div className="space-y-2">
                                <Label>Email Subject</Label>
                                <Input
                                  value={step.subject || ""}
                                  onChange={(e) => handleStepChange(index, "subject", e.target.value)}
                                  placeholder="Email subject line"
                                />
                              </div>
                            )}
                            <div className="space-y-2">
                              <Label>Message Template</Label>
                              <Textarea
                                value={step.message_template}
                                onChange={(e) => handleStepChange(index, "message_template", e.target.value)}
                                rows={4}
                                placeholder="Use {first_name}, {last_name} for personalization..."
                              />
                              <p className="text-xs text-muted-foreground">
                                Variables: {"{first_name}"}, {"{last_name}"}, {"{email}"}, {"{phone}"}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleSubmit} disabled={createSequenceMutation.isPending}>
                    {createSequenceMutation.isPending ? "Creating..." : "Create Sequence"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!sequences || sequences.length === 0 ? (
        <div className="text-center py-12 border rounded-lg border-dashed">
          <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground mb-4">No follow-up sequences yet.</p>
          <Button variant="outline" onClick={handleCreateWithDefaults}>
            <Sparkles className="w-4 h-4 mr-2" />
            Create from Template
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {sequences.map((sequence) => (
            <Card key={sequence.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      {sequence.name}
                      <Badge variant={sequence.is_active ? "default" : "secondary"}>
                        {sequence.is_active ? "Active" : "Paused"}
                      </Badge>
                    </CardTitle>
                    {sequence.description && (
                      <CardDescription>{sequence.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={sequence.is_active}
                      onCheckedChange={(checked) => updateSequenceMutation.mutate({ id: sequence.id, isActive: checked })}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Delete this sequence? All enrolled leads will be removed.")) {
                          deleteSequenceMutation.mutate(sequence.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{sequence.sequence_steps?.length || 0} steps</span>
                  <span>•</span>
                  <span>
                    {sequence.sequence_steps?.reduce((max, step) => Math.max(max, step.delay_days), 0) || 0} day sequence
                  </span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    {sequence.sequence_steps?.some(s => s.channel === "email" || s.channel === "both") && (
                      <Mail className="w-4 h-4" />
                    )}
                    {sequence.sequence_steps?.some(s => s.channel === "sms" || s.channel === "both") && (
                      <MessageSquare className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SequenceManager;
