import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, X, Calendar, Mail, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";

interface LeadEnrollmentDialogProps {
  leadId: string;
  leadName: string;
  trigger: React.ReactNode;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sequence_steps: {
    id: string;
    step_order: number;
    delay_days: number;
    channel: string;
  }[];
}

interface Enrollment {
  id: string;
  sequence_id: string;
  status: string;
  current_step: number;
  enrolled_at: string;
  next_send_at: string | null;
  follow_up_sequences: {
    name: string;
    sequence_steps: { step_order: number }[];
  };
}

const LeadEnrollmentDialog = ({ leadId, leadName, trigger }: LeadEnrollmentDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<string>("");

  const { data: sequences } = useQuery({
    queryKey: ["active-sequences"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("follow_up_sequences")
        .select(`*, sequence_steps(id, step_order, delay_days, channel)`)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Sequence[];
    },
    enabled: open,
  });

  const { data: enrollments, isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["lead-enrollments", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_sequence_enrollments")
        .select(`*, follow_up_sequences(name, sequence_steps(step_order))`)
        .eq("lead_id", leadId);
      if (error) throw error;
      return data as Enrollment[];
    },
    enabled: open,
  });

  const enrollMutation = useMutation({
    mutationFn: async (sequenceId: string) => {
      const sequence = sequences?.find(s => s.id === sequenceId);
      const firstStep = sequence?.sequence_steps?.find(s => s.step_order === 1);
      const nextSendAt = firstStep ? addDays(new Date(), firstStep.delay_days) : null;

      const { error } = await supabase
        .from("lead_sequence_enrollments")
        .insert([{
          lead_id: leadId,
          sequence_id: sequenceId,
          status: "active",
          current_step: 0,
          next_send_at: nextSendAt?.toISOString(),
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-enrollments", leadId] });
      toast({ title: "Lead enrolled in sequence" });
      setSelectedSequence("");
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast({ title: "Already enrolled", description: "This lead is already in this sequence", variant: "destructive" });
      } else {
        toast({ title: "Error enrolling lead", description: error.message, variant: "destructive" });
      }
    },
  });

  const updateEnrollmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("lead_sequence_enrollments")
        .update({ status, completed_at: status === "completed" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-enrollments", leadId] });
      toast({ title: "Enrollment updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating enrollment", description: error.message, variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-500/10 text-green-700 border-green-500/20">Active</Badge>;
      case "paused": return <Badge variant="secondary">Paused</Badge>;
      case "completed": return <Badge className="bg-primary/10 text-primary border-primary/20">Completed</Badge>;
      case "cancelled": return <Badge variant="destructive">Cancelled</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const availableSequences = sequences?.filter(
    s => !enrollments?.some(e => e.sequence_id === s.id && e.status !== "cancelled")
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Sequences for {leadName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Enroll in new sequence */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Enroll in Sequence</label>
            <div className="flex gap-2">
              <Select value={selectedSequence} onValueChange={setSelectedSequence}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a sequence..." />
                </SelectTrigger>
                <SelectContent>
                  {availableSequences?.length === 0 ? (
                    <SelectItem value="_none" disabled>No available sequences</SelectItem>
                  ) : (
                    availableSequences?.map((seq) => (
                      <SelectItem key={seq.id} value={seq.id}>
                        {seq.name} ({seq.sequence_steps?.length || 0} steps)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={() => selectedSequence && enrollMutation.mutate(selectedSequence)}
                disabled={!selectedSequence || enrollMutation.isPending}
              >
                Enroll
              </Button>
            </div>
          </div>

          {/* Current enrollments */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Current Enrollments</label>
            {enrollmentsLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !enrollments || enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enrolled in any sequences</p>
            ) : (
              <div className="space-y-3">
                {enrollments.map((enrollment) => (
                  <Card key={enrollment.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {enrollment.follow_up_sequences.name}
                            {getStatusBadge(enrollment.status)}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                            <span>
                              Step {enrollment.current_step}/{enrollment.follow_up_sequences.sequence_steps?.length || 0}
                            </span>
                            {enrollment.next_send_at && enrollment.status === "active" && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Next: {format(new Date(enrollment.next_send_at), "MMM d")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {enrollment.status === "active" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateEnrollmentMutation.mutate({ id: enrollment.id, status: "paused" })}
                            >
                              <Pause className="w-4 h-4" />
                            </Button>
                          )}
                          {enrollment.status === "paused" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => updateEnrollmentMutation.mutate({ id: enrollment.id, status: "active" })}
                            >
                              <Play className="w-4 h-4" />
                            </Button>
                          )}
                          {(enrollment.status === "active" || enrollment.status === "paused") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm("Cancel this enrollment?")) {
                                  updateEnrollmentMutation.mutate({ id: enrollment.id, status: "cancelled" });
                                }
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LeadEnrollmentDialog;
