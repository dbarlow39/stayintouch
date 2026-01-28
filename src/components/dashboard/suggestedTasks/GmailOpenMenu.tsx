import { ExternalLink, Search, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
type Props = {
  onOpen: (opts: { accountIndex: number | null; mode: "direct" | "search" }) => void;
};

/**
 * Gmail deep links are sensitive to the active Google account.
 * This menu lets users try /u/0 (default), no account prefix, or /u/1.
 */
export function GmailOpenMenu({ onOpen }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline"
          onClick={(e) => {
            // Keep card click from firing.
            e.stopPropagation();
          }}
        >
          <span className="inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            Open in Gmail
            <ChevronDown className="h-3 w-3" />
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => onOpen({ accountIndex: 0, mode: "direct" })}>
          Open email (u/0)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpen({ accountIndex: null, mode: "direct" })}>
          Open email (no account)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpen({ accountIndex: 1, mode: "direct" })}>
          Open email (u/1)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onOpen({ accountIndex: 0, mode: "search" })}>
          <Search className="mr-2 h-4 w-4" />
          Search in Gmail
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
