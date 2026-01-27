import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Plus, AlertCircle, Clock, Mail, CheckCircle2, Check, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SuggestedTask {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  category: string;
  related_client: string | null;
  reasoning: string | null;
  status: string;
  created_at: string;
  source_email_id: string | null;
  gmail_message_id: string | null;
}

const priorityColors = {
  low: "bg-secondary/50 text-secondary-foreground",
  medium: "bg-accent/10 text-accent-foreground",
  high: "bg-primary/10 text-primary",
  urgent: "bg-destructive/10 text-destructive",
};

const categoryIcons = {
  "follow-up": Clock,
  "action-item": CheckCircle2,
  "urgent-response": AlertCircle,
  "proactive-outreach": Mail,
};

const categoryLabels = {
  "follow-up": "Follow-up",
  "action-item": "Action Item",
  "urgent-response": "Urgent",
  "proactive-outreach": "Outreach",
};

const SuggestedTasksSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch persisted suggestions from the database
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggested-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suggested_tasks")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as SuggestedTask[];
    },
    enabled: !!user,
  });

  // Refresh suggestions from AI
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('suggest-tasks-from-emails');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks"] });
      if (data?.newSuggestionsCount > 0) {
        toast({ title: `Added ${data.newSuggestionsCount} new suggestions` });
      } else {
        toast({ title: "No new suggestions found" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error refreshing suggestions", description: error.message, variant: "destructive" });
    },
  });

  // Add suggestion as a task
  const addTaskMutation = useMutation({
    mutationFn: async (suggestion: SuggestedTask) => {
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
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks"] });
      toast({ title: "Task created", description: `"${title}" added to your tasks.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error creating task", description: error.message, variant: "destructive" });
    },
  });

  // Dismiss a suggestion
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("suggested_tasks")
        .update({ status: "dismissed" })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error dismissing suggestion", description: error.message, variant: "destructive" });
    },
  });

  const openGmailEmail = (gmailMessageId: string) => {
    // Gmail URL format to open a specific email
    const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${gmailMessageId}`;
    const win = window.open(gmailUrl, "_blank", "noopener,noreferrer");

    // In embedded previews, popups can be blocked by browser/iframe policies.
    if (!win) {
      toast({
        title: "Couldn't open Gmail",
        description: "Pop-ups may be blocked in the preview. Open the app in a new tab and try again.",
        variant: "destructive",
      });
    }
  };

  if (!user) return null;

  return (
    <Card className="shadow-soft mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Suggested Tasks
            {suggestions && suggestions.length > 0 && (
              <Badge variant="secondary" className="ml-2">{suggestions.length}</Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={isLoading || refreshMutation.isPending}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Based on your recent email communications
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-sm text-muted-foreground">Loading suggestions...</span>
          </div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No task suggestions at this time</p>
            <p className="text-xs mt-1">Click Refresh to analyze recent emails</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => {
              const CategoryIcon = categoryIcons[suggestion.category as keyof typeof categoryIcons] || Clock;
              const hasGmailLink = Boolean(suggestion.gmail_message_id);
              
              return (
                <div
                  key={suggestion.id}
                  role={hasGmailLink ? "button" : undefined}
                  tabIndex={hasGmailLink ? 0 : undefined}
                  onClick={() => {
                    if (!hasGmailLink) return;
                    openGmailEmail(suggestion.gmail_message_id!);
                  }}
                  onKeyDown={(e) => {
                    if (!hasGmailLink) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openGmailEmail(suggestion.gmail_message_id!);
                    }
                  }}
                  className={
                    `p-3 border rounded-lg bg-card hover:border-primary/30 transition-all ` +
                    (hasGmailLink ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring" : "")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs gap-1">
                          <CategoryIcon className="w-3 h-3" />
                          {categoryLabels[suggestion.category as keyof typeof categoryLabels] || suggestion.category}
                        </Badge>
                        <Badge className={`text-xs ${priorityColors[suggestion.priority as keyof typeof priorityColors] || priorityColors.medium}`}>
                          {suggestion.priority}
                        </Badge>
                        {suggestion.related_client && (
                          <span className="text-xs text-muted-foreground">
                            • {suggestion.related_client}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-sm">{suggestion.title}</p>
                      {suggestion.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {suggestion.description}
                        </p>
                      )}
                      {suggestion.reasoning && (
                        <p className="text-xs text-muted-foreground/70 mt-1 italic">
                          {suggestion.reasoning}
                        </p>
                      )}
                      {suggestion.gmail_message_id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openGmailEmail(suggestion.gmail_message_id!);
                          }}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open in Gmail
                        </button>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={addTaskMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          addTaskMutation.mutate(suggestion);
                        }}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={dismissMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissMutation.mutate(suggestion.id);
                        }}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SuggestedTasksSection;
