import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Mail, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { getSuggestedTaskGmailSearchUrl, getSuggestedTaskGmailUrl } from "@/components/dashboard/suggestedTasks/getGmailUrl";
import { gmailNewUiTokenFromLegacyHex, gmailUrlForLegacyHex } from "@/utils/gmailDeepLink";
import type { SuggestedTask, TriageCategory, TriageStats } from "@/components/dashboard/suggestedTasks/types";
import { EmailDigestSummary } from "@/components/dashboard/suggestedTasks/EmailDigestSummary";
import { TriageCategorySection } from "@/components/dashboard/suggestedTasks/TriageCategorySection";

const SuggestedTasksSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing pending task titles to filter out duplicates
  const { data: existingTaskTitles } = useQuery({
    queryKey: ["task-titles", user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data, error } = await supabase
        .from("tasks")
        .select("title")
        .eq("agent_id", user.id)
        .limit(500);
      
      if (error) throw error;
      return new Set((data || []).map(t => t.title.toLowerCase().trim()));
    },
    enabled: !!user,
  });

  // Track last refresh time
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [selectedDigestIds, setSelectedDigestIds] = useState<Set<string>>(new Set());

  const toggleDigestSelection = (id: string) => {
    setSelectedDigestIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkDismissSelected = () => {
    if (selectedDigestIds.size === 0) return;
    markAllReadMutation.mutate(Array.from(selectedDigestIds), {
      onSuccess: () => setSelectedDigestIds(new Set()),
    });
  };
  // Fetch persisted suggestions with email data
  const { data: suggestions, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["suggested-tasks", user?.id, existingTaskTitles],
    queryFn: async () => {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from("suggested_tasks")
        .select(
          "*, client_email_logs!suggested_tasks_source_email_id_fkey(subject, thread_id, from_email, received_at, gmail_message_id)"
        )
        .eq("status", "pending")
        .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      const mapped = (data || []).map((item: any) => ({
        ...item,
        email_subject: item.client_email_logs?.subject || null,
        thread_id: item.client_email_logs?.thread_id || null,
        email_from: item.client_email_logs?.from_email || null,
        email_received_at: item.client_email_logs?.received_at || null,
        gmail_message_id: item.gmail_message_id || item.client_email_logs?.gmail_message_id || null,
        client_email_logs: undefined,
      })) as SuggestedTask[];
      
      const filtered = existingTaskTitles 
        ? mapped.filter(s => !existingTaskTitles.has(s.title.toLowerCase().trim()))
        : mapped;
      
      return filtered.sort((a, b) => {
        const dateA = a.email_received_at ? new Date(a.email_received_at).getTime() : 0;
        const dateB = b.email_received_at ? new Date(b.email_received_at).getTime() : 0;
        return dateB - dateA;
      });
    },
    enabled: !!user && existingTaskTitles !== undefined,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  // Update last refresh time when data updates
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastRefreshTime(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // Calculate triage stats
  const triageStats: TriageStats = useMemo(() => {
    if (!suggestions) return { urgent: 0, important: 0, fyi: 0, ignore: 0 };
    
    return {
      urgent: suggestions.filter(s => s.triage_category === 'urgent').length,
      important: suggestions.filter(s => s.triage_category === 'important').length,
      fyi: suggestions.filter(s => s.triage_category === 'fyi').length,
      ignore: suggestions.filter(s => s.triage_category === 'ignore').length,
    };
  }, [suggestions]);

  // Group suggestions by triage category
  const groupedSuggestions = useMemo(() => {
    if (!suggestions) return { urgent: [], important: [], fyi: [], ignore: [] };
    
    return {
      urgent: suggestions.filter(s => s.triage_category === 'urgent'),
      important: suggestions.filter(s => s.triage_category === 'important' || !s.triage_category),
      fyi: suggestions.filter(s => s.triage_category === 'fyi'),
      ignore: suggestions.filter(s => s.triage_category === 'ignore'),
    };
  }, [suggestions]);

  // Refresh suggestions from AI
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('suggest-tasks-from-emails');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks"] });
      setLastRefreshTime(new Date());
      if (data?.newSuggestionsCount > 0) {
        toast({ 
          title: `Added ${data.newSuggestionsCount} new items`,
          description: data.stats 
            ? `${data.stats.urgent} urgent, ${data.stats.important} important, ${data.stats.fyi} FYI`
            : undefined
        });
      } else {
        toast({ title: "No new emails to triage" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error refreshing", description: error.message, variant: "destructive" });
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
      toast({ title: "Error dismissing", description: error.message, variant: "destructive" });
    },
  });

  // Snooze a suggestion until tomorrow
  const snoozeMutation = useMutation({
    mutationFn: async (id: string) => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      
      const { error } = await supabase
        .from("suggested_tasks")
        .update({ snoozed_until: tomorrow.toISOString() })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks"] });
      toast({ title: "Snoozed until tomorrow 9 AM" });
    },
    onError: (error: Error) => {
      toast({ title: "Error snoozing", description: error.message, variant: "destructive" });
    },
  });

  // Mark all as read/done
  const markAllReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("suggested_tasks")
        .update({ status: "dismissed" })
        .in("id", ids);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suggested-tasks"] });
      toast({ title: "All marked as done" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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

    if (!url) {
      toast({
        title: "No email linked",
        description: "This suggestion wasn't linked to a specific email.",
      });
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Subscribe to realtime updates
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

  const hasUrgentOrImportant = triageStats.urgent > 0 || triageStats.important > 0;
  const showFyi = hasUrgentOrImportant || triageStats.fyi > 0;
  const totalCount = (suggestions?.length || 0);

  return (
    <Card className="shadow-soft mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Email Digest
            {totalCount > 0 && (
              <Badge variant="secondary" className="ml-2">{totalCount}</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {selectedDigestIds.size > 0 && (
              <Button
                size="sm"
                onClick={bulkDismissSelected}
                disabled={markAllReadMutation.isPending}
              >
                <Check className="w-4 h-4 mr-1" />
                Mark {selectedDigestIds.size} Done
              </Button>
            )}
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshMutation.mutate()}
                disabled={isLoading || refreshMutation.isPending}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {lastRefreshTime && (
                <span className="text-xs text-muted-foreground text-center">
                  Updated {formatDistanceToNow(lastRefreshTime, { addSuffix: true })} at{' '}
                  {lastRefreshTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          AI-powered email triage • Auto-syncs every 15 minutes
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-sm text-muted-foreground">Analyzing emails...</span>
          </div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No emails to triage</p>
            <p className="text-xs mt-1">Click Refresh to analyze recent emails</p>
          </div>
        ) : (
          <>
            <EmailDigestSummary stats={triageStats} isLoading={isLoading} />
            
            <TriageCategorySection
              category="urgent"
              items={groupedSuggestions.urgent}
              defaultOpen={true}
              onDismiss={(id) => dismissMutation.mutate(id)}
              onSnooze={(id) => snoozeMutation.mutate(id)}
              onMarkAllRead={(ids) => markAllReadMutation.mutate(ids)}
              onOpenEmail={openGmailEmail}
              isDismissing={dismissMutation.isPending}
              selectedIds={selectedDigestIds}
              onToggleSelection={toggleDigestSelection}
            />
            
            <TriageCategorySection
              category="important"
              items={groupedSuggestions.important}
              defaultOpen={true}
              onDismiss={(id) => dismissMutation.mutate(id)}
              onSnooze={(id) => snoozeMutation.mutate(id)}
              onMarkAllRead={(ids) => markAllReadMutation.mutate(ids)}
              onOpenEmail={openGmailEmail}
              isDismissing={dismissMutation.isPending}
              selectedIds={selectedDigestIds}
              onToggleSelection={toggleDigestSelection}
            />
            
            {showFyi && (
              <TriageCategorySection
                category="fyi"
                items={groupedSuggestions.fyi}
                defaultOpen={!hasUrgentOrImportant}
                onDismiss={(id) => dismissMutation.mutate(id)}
                onSnooze={(id) => snoozeMutation.mutate(id)}
                onMarkAllRead={(ids) => markAllReadMutation.mutate(ids)}
                onOpenEmail={openGmailEmail}
                isDismissing={dismissMutation.isPending}
                selectedIds={selectedDigestIds}
                onToggleSelection={toggleDigestSelection}
              />
            )}
            
            <TriageCategorySection
              category="ignore"
              items={groupedSuggestions.ignore}
              defaultOpen={false}
              onDismiss={(id) => dismissMutation.mutate(id)}
              onSnooze={(id) => snoozeMutation.mutate(id)}
              onMarkAllRead={(ids) => markAllReadMutation.mutate(ids)}
              onOpenEmail={openGmailEmail}
              isDismissing={dismissMutation.isPending}
              selectedIds={selectedDigestIds}
              onToggleSelection={toggleDigestSelection}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SuggestedTasksSection;
