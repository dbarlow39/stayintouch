import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Plus, AlertCircle, Clock, Mail, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TaskSuggestion {
  title: string;
  description: string;
  priority: "urgent" | "high" | "medium" | "low";
  category: "follow-up" | "action-item" | "urgent-response";
  relatedClient: string | null;
  reasoning: string;
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
};

const categoryLabels = {
  "follow-up": "Follow-up",
  "action-item": "Action Item",
  "urgent-response": "Urgent",
};

const SuggestedTasksSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["suggested-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('suggest-tasks-from-emails');
      
      if (error) throw error;
      return data as { suggestions: TaskSuggestion[]; message?: string; error?: string };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    refetchOnWindowFocus: false,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (suggestion: TaskSuggestion) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert([{
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          agent_id: user?.id,
          status: "pending",
        }])
        .select()
        .single();
      
      if (error) throw error;
      return { data, title: suggestion.title };
    },
    onSuccess: ({ title }) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setAddedTasks(prev => new Set(prev).add(title));
      toast({ title: "Task created", description: "The suggested task has been added to your list." });
    },
    onError: (error: Error) => {
      toast({ title: "Error creating task", description: error.message, variant: "destructive" });
    },
  });

  const suggestions = data?.suggestions || [];
  const hasError = !!data?.error;

  if (!user) return null;

  return (
    <Card className="shadow-soft mb-6 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Suggested Tasks
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isRefetching ? 'animate-spin' : ''}`} />
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
            <span className="ml-3 text-sm text-muted-foreground">Analyzing your emails...</span>
          </div>
        ) : hasError ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{data?.error || "Unable to generate suggestions"}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No task suggestions at this time</p>
            <p className="text-xs mt-1">Your communications are up to date!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion, index) => {
              const CategoryIcon = categoryIcons[suggestion.category] || Clock;
              const isAdded = addedTasks.has(suggestion.title);
              
              return (
                <div
                  key={index}
                  className={`p-3 border rounded-lg bg-card transition-all ${
                    isAdded ? 'opacity-50' : 'hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs gap-1">
                          <CategoryIcon className="w-3 h-3" />
                          {categoryLabels[suggestion.category]}
                        </Badge>
                        <Badge className={`text-xs ${priorityColors[suggestion.priority]}`}>
                          {suggestion.priority}
                        </Badge>
                        {suggestion.relatedClient && (
                          <span className="text-xs text-muted-foreground">
                            • {suggestion.relatedClient}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-sm">{suggestion.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {suggestion.description}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">
                        {suggestion.reasoning}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "ghost" : "outline"}
                      disabled={isAdded || createTaskMutation.isPending}
                      onClick={() => createTaskMutation.mutate(suggestion)}
                      className="shrink-0"
                    >
                      {isAdded ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Added
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 mr-1" />
                          Add
                        </>
                      )}
                    </Button>
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
