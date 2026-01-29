import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Plus, AlertCircle, Clock, Mail, CheckCircle2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSuggestedTaskGmailSearchUrl, getSuggestedTaskGmailUrl } from "@/components/dashboard/suggestedTasks/getGmailUrl";
import { gmailNewUiTokenFromLegacyHex, gmailUrlForLegacyHex } from "@/utils/gmailDeepLink";
import type { SuggestedTask } from "@/components/dashboard/suggestedTasks/types";
import { GmailOpenMenu } from "@/components/dashboard/suggestedTasks/GmailOpenMenu";

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

  // Fetch persisted suggestions from the database with email subject for Gmail links
  const { data: suggestions, isLoading } = useQuery({
    queryKey: ["suggested-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suggested_tasks")
        .select(
          "*, client_email_logs!suggested_tasks_source_email_id_fkey(subject, thread_id, from_email, received_at, gmail_message_id)"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      // Map the joined data to include email_subject and thread_id
      return (data || []).map((item: any) => ({
        ...item,
        email_subject: item.client_email_logs?.subject || null,
        thread_id: item.client_email_logs?.thread_id || null,
        email_from: item.client_email_logs?.from_email || null,
        email_received_at: item.client_email_logs?.received_at || null,
        // Prefer suggested_tasks.gmail_message_id, but fall back to the source email log id
        gmail_message_id: item.gmail_message_id || item.client_email_logs?.gmail_message_id || null,
        client_email_logs: undefined, // Clean up the nested object
      })) as SuggestedTask[];
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

  const openGmailEmail = (
    suggestion: SuggestedTask,
    opts: { accountIndex: number | null; mode: "direct" | "search" } = { accountIndex: 0, mode: "direct" }
  ) => {
    const url =
      opts.mode === "search"
        ? getSuggestedTaskGmailSearchUrl(suggestion, { accountIndex: opts.accountIndex })
        : getSuggestedTaskGmailUrl(suggestion, { accountIndex: opts.accountIndex });

    // Verbose debug: only logs on click (not during render).
    if (import.meta.env.DEV) {
      const msgId = (suggestion.gmail_message_id ?? "").trim();
      const threadId = (suggestion.thread_id ?? "").trim();
      const isHex = (v: string) => /^[0-9a-f]{15,16}$/i.test(v);

      const msgTokens = msgId && isHex(msgId)
        ? {
            thread: gmailNewUiTokenFromLegacyHex(msgId, "thread"),
            msg: gmailNewUiTokenFromLegacyHex(msgId, "msg"),
          }
        : null;

      const threadTokens = threadId && isHex(threadId)
        ? {
            thread: gmailNewUiTokenFromLegacyHex(threadId, "thread"),
            msg: gmailNewUiTokenFromLegacyHex(threadId, "msg"),
          }
        : null;

      // eslint-disable-next-line no-console
      console.groupCollapsed(`[GmailLink][SuggestedTask:${suggestion.id}] ${suggestion.title}`);
      // eslint-disable-next-line no-console
      console.log({
        gmail_message_id: suggestion.gmail_message_id ?? null,
        thread_id: suggestion.thread_id ?? null,
        email_subject: (suggestion as any).email_subject ?? null,
        email_from: (suggestion as any).email_from ?? null,
        email_received_at: (suggestion as any).email_received_at ?? null,
      });
      // eslint-disable-next-line no-console
      console.log({
        chosenUrl: url,
        chosenMode: opts,
        msgTokens,
        threadTokens,
        msgAutoUrl: msgId && isHex(msgId) ? gmailUrlForLegacyHex(msgId, "auto") : null,
        threadAutoUrl: threadId && isHex(threadId) ? gmailUrlForLegacyHex(threadId, "auto") : null,
      });
      // eslint-disable-next-line no-console
      console.groupEnd();
    }

    if (!url) {
      toast({
        title: "No email linked",
        description: "This suggestion wasn't linked to a specific email.",
      });
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Subscribe to realtime inserts on suggested_tasks to auto-refresh when sync adds new suggestions
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("suggested_tasks_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "suggested_tasks",
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["suggested-tasks", user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

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
              const hasEmailLink = Boolean(getSuggestedTaskGmailUrl(suggestion));
              
              return (
                <div
                  key={suggestion.id}
                  role={hasEmailLink ? "button" : undefined}
                  tabIndex={hasEmailLink ? 0 : undefined}
                   onClick={() => {
                    if (!hasEmailLink) return;
                     openGmailEmail(suggestion, { accountIndex: 0, mode: "direct" });
                  }}
                  onKeyDown={(e) => {
                    if (!hasEmailLink) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                       openGmailEmail(suggestion, { accountIndex: 0, mode: "direct" });
                    }
                  }}
                  className={
                    `p-3 border rounded-lg bg-card hover:border-primary/30 transition-all ` +
                    (hasEmailLink ? "cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring" : "")
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
                        {suggestion.email_from && (
                          <span className="text-xs text-muted-foreground">
                            • {suggestion.email_from}
                          </span>
                        )}
                        {suggestion.email_received_at && (
                          <span className="text-xs text-muted-foreground">
                            • {new Date(suggestion.email_received_at).toLocaleDateString()} {new Date(suggestion.email_received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                       {hasEmailLink && (
                         <div className="mt-2">
                           <GmailOpenMenu
                             onOpen={(o) => openGmailEmail(suggestion, o)}
                           />
                         </div>
                       )}
                    </div>
                    <div className="flex gap-1 shrink-0">
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
