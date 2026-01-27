import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Archive, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  is_archived: boolean;
}

const priorityColors = {
  low: "bg-secondary/50 text-secondary-foreground border-border",
  medium: "bg-accent/10 text-accent-foreground border-accent/20",
  high: "bg-primary/10 text-primary border-primary/20",
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
};

const ArchivedTasksDialog = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: archivedTasks, isLoading } = useQuery({
    queryKey: ["archived-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("is_archived", true)
        .order("completed_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as Task[];
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ is_archived: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast({ title: "Task restored" });
    },
    onError: (error: Error) => {
      toast({ title: "Error restoring task", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Archive className="w-4 h-4 mr-2" />
          Archived Tasks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="w-5 h-5" />
            Archived Tasks
          </DialogTitle>
        </DialogHeader>
        
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading archived tasks...</div>
        ) : !archivedTasks || archivedTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Archive className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No archived tasks yet.</p>
          </div>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Archived</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archivedTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => restoreMutation.mutate(task.id)}
                        title="Restore task"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ArchivedTasksDialog;
