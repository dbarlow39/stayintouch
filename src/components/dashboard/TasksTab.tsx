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
import { CheckCircle2, Circle, Clock, Plus, Check, Mail, RefreshCw, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import ArchivedTasksDialog from "./ArchivedTasksDialog";

// Generate Gmail search URL from task title
const getGmailSearchUrl = (taskTitle: string): string => {
  const searchQuery = encodeURIComponent(taskTitle);
  return `https://mail.google.com/mail/u/#search/${searchQuery}`;
};

// Generate Gmail direct link from message ID
const getGmailDirectUrl = (gmailMessageId: string | null | undefined): string | null => {
  if (!gmailMessageId) return null;
  // Convert hex message ID to Gmail's base64-like format if needed
  const msgId = gmailMessageId.trim();
  if (!msgId) return null;
  return `https://mail.google.com/mail/u/#inbox/${msgId}`;
};

interface UnifiedTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  is_archived: boolean;
  task_type: 'manual' | 'ai-suggested';
  // AI-specific fields
  category?: string;
  related_client?: string | null;
  email_subject?: string | null;
  email_from?: string | null;
  email_received_at?: string | null;
  gmail_message_id?: string | null;
  thread_id?: string | null;
  reasoning?: string | null;
}

const priorityColors = {
  low: "bg-secondary/50 text-secondary-foreground border-border",
  medium: "bg-accent/10 text-accent-foreground border-accent/20",
  high: "bg-primary/10 text-primary border-primary/20",
  urgent: "bg-destructive/10 text-destructive border-destructive/20",
};

const categoryLabels: Record<string, string> = {
  "follow-up": "Follow-up",
  "action-item": "Action Item",
  "urgent-response": "Urgent",
  "proactive-outreach": "Outreach",
};

const TasksTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
    due_date: "",
  });

  // Unified query: fetch both regular tasks AND AI suggested tasks
  const { data: allTasks, isLoading } = useQuery({
    queryKey: ["all-tasks", user?.id],
    queryFn: async () => {
      // Fetch regular tasks
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("*")
        .eq("is_archived", false)
        .order("created_at", { ascending: false });
      
      if (tasksError) throw tasksError;
      
      // Fetch AI suggested tasks with email metadata
      const { data: suggestions, error: suggestionsError } = await supabase
        .from("suggested_tasks")
        .select("*, client_email_logs!suggested_tasks_source_email_id_fkey(subject, from_email, received_at, gmail_message_id, thread_id)")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (suggestionsError) throw suggestionsError;
      
      // Convert suggestions to unified task format
      const suggestedTasks: UnifiedTask[] = (suggestions || []).map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        priority: s.priority,
        status: 'suggested',
        due_date: null,
        completed_at: null,
        created_at: s.created_at,
        is_archived: false,
        task_type: 'ai-suggested' as const,
        category: s.category,
        related_client: s.related_client,
        email_subject: s.client_email_logs?.subject,
        email_from: s.client_email_logs?.from_email,
        email_received_at: s.client_email_logs?.received_at,
        gmail_message_id: s.gmail_message_id || s.client_email_logs?.gmail_message_id,
        thread_id: s.client_email_logs?.thread_id,
        reasoning: s.reasoning,
      }));
      
      const manualTasks: UnifiedTask[] = (tasks || []).map((t: any) => ({
        ...t,
        task_type: 'manual' as const,
      }));
      
      // Merge and sort by date received (email_received_at for AI tasks, created_at for manual)
      const merged = [...suggestedTasks, ...manualTasks].sort((a, b) => {
        const dateA = new Date(a.email_received_at || a.created_at).getTime();
        const dateB = new Date(b.email_received_at || b.created_at).getTime();
        return dateB - dateA; // newest first
      });
      
      return merged;
    },
    enabled: !!user,
    refetchInterval: 30_000, // Refresh every 30 seconds
  });

  const createMutation = useMutation({
    mutationFn: async (newTask: any) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert([{ 
          ...newTask, 
          agent_id: user?.id,
          status: "pending",
        }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      toast({ title: "Task created successfully" });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating task", description: error.message, variant: "destructive" });
    },
  });

  // Archive a manual task
  const archiveTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          status: "completed",
          completed_at: new Date().toISOString(),
          is_archived: true,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      toast({ title: "Task archived" });
    },
    onError: (error: Error) => {
      toast({ title: "Error archiving task", description: error.message, variant: "destructive" });
    },
  });

  // Add AI suggestion to regular tasks
  const addToTasksMutation = useMutation({
    mutationFn: async (suggestion: UnifiedTask) => {
      // Create the task
      const { error: taskError } = await supabase
        .from("tasks")
        .insert([{
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority as "low" | "medium" | "high" | "urgent",
          agent_id: user?.id,
          status: "pending",
        }]);
      
      if (taskError) throw taskError;

      // Mark suggestion as added
      const { error: updateError } = await supabase
        .from("suggested_tasks")
        .update({ status: "added" })
        .eq("id", suggestion.id);
      
      if (updateError) throw updateError;
      
      return suggestion.title;
    },
    onSuccess: (title) => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      toast({ title: "Task created", description: `"${title}" added to your tasks.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error creating task", description: error.message, variant: "destructive" });
    },
  });

  // Dismiss AI suggestion
  const dismissSuggestionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("suggested_tasks")
        .update({ status: "dismissed" })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error dismissing suggestion", description: error.message, variant: "destructive" });
    },
  });

  // Sync Gmail
  const syncGmailMutation = useMutation({
    mutationFn: async () => {
      setIsSyncing(true);
      try {
        const { data, error } = await supabase.functions.invoke('sync-gmail-emails', {
          body: { 
            agent_id: user?.id, 
            days_back: 21, 
            max_results: 500 
          }
        });
        
        if (error) throw error;
        return data;
      } finally {
        setIsSyncing(false);
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["all-tasks"] });
      toast({ 
        title: "Gmail Synced!", 
        description: `Synced ${data?.synced_count || 0} emails. ${data?.showingtime_count || 0} ShowingTime notifications found.`
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Sync Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      due_date: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  const openGmail = (task: UnifiedTask) => {
    // Try direct link first if we have a gmail_message_id
    const directUrl = getGmailDirectUrl(task.gmail_message_id);
    if (directUrl) {
      window.open(directUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // Fall back to search
    const searchUrl = getGmailSearchUrl(task.title);
    window.open(searchUrl, "_blank", "noopener,noreferrer");
  };

  const pendingTasks = allTasks?.filter(t => t.status !== "completed") || [];
  const aiSuggestedCount = pendingTasks.filter(t => t.task_type === 'ai-suggested').length;
  const manualCount = pendingTasks.filter(t => t.task_type === 'manual').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Task Management</h3>
          <p className="text-sm text-muted-foreground">
            {aiSuggestedCount > 0 && (
              <span className="inline-flex items-center gap-1 mr-2">
                <Sparkles className="w-3 h-3 text-primary" />
                {aiSuggestedCount} AI suggested
              </span>
            )}
            {manualCount > 0 && (
              <span>{manualCount} manual tasks</span>
            )}
            {aiSuggestedCount === 0 && manualCount === 0 && "Stay organized with your tasks"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => syncGmailMutation.mutate()}
            disabled={isSyncing || syncGmailMutation.isPending}
          >
            {isSyncing || syncGmailMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sync Gmail
              </>
            )}
          </Button>
          <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); if (!isOpen) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Task Title *</Label>
                  <Input
                    id="title"
                    placeholder="Follow up with client"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    rows={3}
                    placeholder="Add task details..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      id="due_date"
                      type="datetime-local"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Task</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading tasks...</div>
      ) : !allTasks || allTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No tasks yet. Create your first task or sync Gmail for AI suggestions.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingTasks.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Circle className="w-4 h-4" />
                All Tasks ({pendingTasks.length})
              </h4>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingTasks.map((task) => (
                      <TableRow 
                        key={task.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openGmail(task)}
                      >
                        <TableCell>
                          <div className="flex items-start gap-2">
                            {task.task_type === 'ai-suggested' ? (
                              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            ) : (
                              <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium">{task.title}</p>
                              {task.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1">{task.description}</p>
                              )}
                              {task.task_type === 'ai-suggested' && (
                                <div className="flex flex-wrap items-center gap-1 mt-1 text-xs text-muted-foreground">
                                  {task.related_client && <span>• {task.related_client}</span>}
                                  {task.email_from && <span>• {task.email_from}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {task.task_type === 'ai-suggested' ? (
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="text-xs gap-1 w-fit border-primary/30 text-primary">
                                <Sparkles className="w-3 h-3" />
                                AI
                              </Badge>
                              {task.category && (
                                <Badge variant="secondary" className="text-xs w-fit">
                                  {categoryLabels[task.category] || task.category}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">Manual</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={priorityColors[task.priority as keyof typeof priorityColors]}>
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {new Date(task.email_received_at || task.created_at).toLocaleDateString()}
                            <span className="text-xs text-muted-foreground ml-1">
                              {new Date(task.email_received_at || task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {task.task_type === 'ai-suggested' ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToTasksMutation.mutate(task);
                                  }}
                                  disabled={addToTasksMutation.isPending}
                                  title="Add to tasks"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    dismissSuggestionMutation.mutate(task.id);
                                  }}
                                  disabled={dismissSuggestionMutation.isPending}
                                  title="Dismiss"
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveTaskMutation.mutate(task.id);
                                }}
                                disabled={archiveTaskMutation.isPending}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Done
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 pt-6 border-t">
        <ArchivedTasksDialog />
      </div>
    </div>
  );
};

export default TasksTab;
