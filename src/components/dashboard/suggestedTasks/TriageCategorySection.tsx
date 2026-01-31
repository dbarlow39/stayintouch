import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { GmailOpenMenu } from "./GmailOpenMenu";
import { getSuggestedTaskGmailUrl } from "./getGmailUrl";
import type { SuggestedTask, TriageCategory } from "./types";

interface TriageCategorySectionProps {
  category: TriageCategory;
  items: SuggestedTask[];
  defaultOpen?: boolean;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onMarkAllRead: (ids: string[]) => void;
  onOpenEmail: (suggestion: SuggestedTask, opts: { accountIndex: number | null; mode: "direct" | "search" }) => void;
  isDismissing?: boolean;
}

const categoryConfig: Record<TriageCategory, {
  label: string;
  sublabel: string;
  badgeClass: string;
  dotClass: string;
  icon: typeof Clock;
}> = {
  urgent: {
    label: "Urgent",
    sublabel: "Needs Immediate Attention",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    dotClass: "bg-destructive animate-pulse",
    icon: Clock,
  },
  important: {
    label: "Important",
    sublabel: "Review Today",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    dotClass: "bg-primary/70",
    icon: Clock,
  },
  fyi: {
    label: "FYI",
    sublabel: "No Action Needed",
    badgeClass: "bg-secondary text-secondary-foreground border-secondary",
    dotClass: "bg-blue-500",
    icon: Mail,
  },
  ignore: {
    label: "Can Ignore",
    sublabel: "Spam & Marketing",
    badgeClass: "bg-muted text-muted-foreground border-muted-foreground/20",
    dotClass: "bg-muted-foreground/50",
    icon: Mail,
  },
};

export const TriageCategorySection = ({
  category,
  items,
  defaultOpen = true,
  onDismiss,
  onSnooze,
  onMarkAllRead,
  onOpenEmail,
  isDismissing,
}: TriageCategorySectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const config = categoryConfig[category];

  if (items.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mb-4">
      <div className="flex items-center justify-between py-2">
        <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <div className={`w-2 h-2 rounded-full ${config.dotClass}`} />
          <span className="font-medium text-sm">{config.label}</span>
          <span className="text-xs text-muted-foreground">({config.sublabel})</span>
          <Badge variant="outline" className="ml-2 text-xs">
            {items.length}
          </Badge>
        </CollapsibleTrigger>
        
        {items.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => onMarkAllRead(items.map(i => i.id))}
          >
            <Check className="w-3 h-3 mr-1" />
            Mark all done
          </Button>
        )}
      </div>

      <CollapsibleContent className="space-y-2 pl-4">
        {items.map((item) => {
          const hasEmailLink = Boolean(getSuggestedTaskGmailUrl(item));
          
          return (
            <div
              key={item.id}
              className={`p-3 border rounded-lg bg-card hover:border-primary/30 transition-all ${
                hasEmailLink ? "cursor-pointer" : ""
              }`}
              onClick={() => hasEmailLink && onOpenEmail(item, { accountIndex: null, mode: "direct" })}
              role={hasEmailLink ? "button" : undefined}
              tabIndex={hasEmailLink ? 0 : undefined}
              onKeyDown={(e) => {
                if (!hasEmailLink) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenEmail(item, { accountIndex: null, mode: "direct" });
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className={`text-xs ${config.badgeClass}`}>
                      {config.label}
                    </Badge>
                    {item.sender && (
                      <span className="text-xs text-muted-foreground font-medium">
                        {item.sender}
                      </span>
                    )}
                    {item.email_received_at && (
                      <span className="text-xs text-muted-foreground">
                        • {new Date(item.email_received_at).toLocaleDateString()}{" "}
                        {new Date(item.email_received_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                  
                  <p className="font-medium text-sm">{item.title}</p>
                  
                  {item.email_summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.email_summary}
                    </p>
                  )}
                  
                  {item.action_needed && (
                    <p className="text-xs text-primary/80 mt-1 font-medium">
                      → {item.action_needed}
                    </p>
                  )}
                  
                  {hasEmailLink && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                      <GmailOpenMenu onOpen={(o) => onOpenEmail(item, o)} />
                    </div>
                  )}
                </div>
                
                <div className="flex gap-1 shrink-0">
                  {category !== 'fyi' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSnooze(item.id);
                      }}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Snooze
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isDismissing}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(item.id);
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
      </CollapsibleContent>
    </Collapsible>
  );
};
