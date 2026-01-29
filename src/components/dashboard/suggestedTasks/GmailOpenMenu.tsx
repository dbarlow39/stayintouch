import { ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onOpen: (opts: { accountIndex: number | null; mode: "direct" | "search" }) => void;
};

/**
 * Simple Gmail links: primary "Open in Gmail" (auto routing) + fallback "Search".
 */
export function GmailOpenMenu({ onOpen }: Props) {
  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline"
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ accountIndex: 0, mode: "direct" });
        }}
      >
        <ExternalLink className="h-3 w-3 mr-1" />
        Open in Gmail
      </Button>
      <span className="text-muted-foreground text-xs">|</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto p-0 text-xs text-muted-foreground hover:bg-transparent hover:underline hover:text-primary"
        onClick={(e) => {
          e.stopPropagation();
          onOpen({ accountIndex: 0, mode: "search" });
        }}
      >
        <Search className="h-3 w-3 mr-1" />
        Search
      </Button>
    </div>
  );
}
