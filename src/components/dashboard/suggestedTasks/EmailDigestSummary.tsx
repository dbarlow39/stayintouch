import { Mail, AlertCircle, Clock, Info, Filter } from "lucide-react";
import type { TriageStats } from "./types";

interface EmailDigestSummaryProps {
  stats: TriageStats;
  isLoading?: boolean;
}

export const EmailDigestSummary = ({ stats, isLoading }: EmailDigestSummaryProps) => {
  const totalActionable = stats.urgent + stats.important;
  const isAllCaughtUp = totalActionable === 0;

  if (isLoading) {
    return (
      <div className="bg-muted/30 rounded-lg p-4 mb-4">
        <div className="animate-pulse flex items-center gap-2">
          <div className="h-4 w-4 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (isAllCaughtUp && stats.fyi === 0) {
    return (
      <div className="bg-accent/20 border border-accent/30 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 text-accent-foreground">
          <span className="text-2xl">🎉</span>
          <span className="font-medium">You're all caught up!</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 ml-8">
          No urgent or important emails need your attention right now.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-muted/30 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium text-sm">Today's Email Snapshot</span>
      </div>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.urgent > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm">
              <span className="font-semibold text-destructive">{stats.urgent}</span>
              <span className="text-muted-foreground ml-1">urgent</span>
            </span>
          </div>
        )}
        
        {stats.important > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary/70" />
            <span className="text-sm">
              <span className="font-semibold text-primary">{stats.important}</span>
              <span className="text-muted-foreground ml-1">important</span>
            </span>
          </div>
        )}
        
        {stats.fyi > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-secondary" />
            <span className="text-sm">
              <span className="font-semibold text-secondary-foreground">{stats.fyi}</span>
              <span className="text-muted-foreground ml-1">FYI</span>
            </span>
          </div>
        )}
        
        {stats.ignore > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
            <span className="text-sm">
              <span className="font-semibold text-muted-foreground">{stats.ignore}</span>
              <span className="text-muted-foreground ml-1">filtered</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
