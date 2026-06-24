import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { Mail, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface ClientEmail {
  id: string;
  direction: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  snippet: string | null;
  body_preview: string | null;
  received_at: string;
  is_read: boolean | null;
}

interface ClientCommunicationsViewProps {
  clientEmail: string | null | undefined;
  propertyAddress?: string | null;
}

const ClientCommunicationsView = ({ clientEmail, propertyAddress }: ClientCommunicationsViewProps) => {
  const { user } = useAuth();

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["client-communications", clientEmail, propertyAddress],
    queryFn: async () => {
      const emailList = (clientEmail || "").split(",").map(e => e.trim()).filter(Boolean);

      // Build address search terms (full + short form "number + first word")
      const addrTerms: string[] = [];
      const addr = (propertyAddress || "").trim();
      if (addr) {
        addrTerms.push(addr);
        const parts = addr.split(/\s+/);
        if (parts.length >= 2) {
          const shortForm = `${parts[0]} ${parts[1]}`;
          if (shortForm !== addr) addrTerms.push(shortForm);
        }
      }

      if (emailList.length === 0 && addrTerms.length === 0) return [];

      const escape = (s: string) => s.replace(/,/g, " ").replace(/[()]/g, " ");
      const orParts: string[] = [];
      for (const email of emailList) {
        orParts.push(`from_email.ilike.%${escape(email)}%`);
        orParts.push(`to_email.ilike.%${escape(email)}%`);
      }
      for (const term of addrTerms) {
        const t = escape(term);
        orParts.push(`subject.ilike.%${t}%`);
        orParts.push(`snippet.ilike.%${t}%`);
        orParts.push(`body_preview.ilike.%${t}%`);
      }

      const { data, error } = await supabase
        .from("client_email_logs")
        .select("*")
        .eq("agent_id", user!.id)
        .or(orParts.join(","))
        .order("received_at", { ascending: false });
      
      if (error) throw error;
      
      // Filter out emails sent FROM ShowingTime (but keep client-forwarded emails)
      const filteredEmails = (data as ClientEmail[]).filter(email => {
        const fromLower = email.from_email.toLowerCase();
        
        // Only exclude if the sender is ShowingTime
        const isFromShowingTime = 
          fromLower.includes("showingtime") ||
          fromLower.includes("showing.com");
        
        return !isFromShowingTime;
      });
      
      return filteredEmails;
    },
    enabled: !!user && (!!clientEmail || !!propertyAddress),
  });

  if (!clientEmail && !propertyAddress) {
    return (
      <div className="text-center py-8 border border-dashed rounded-lg">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No email address or property on file</p>
        <p className="text-sm text-muted-foreground">
          Add an email address or property address to see communications
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        Loading communications...
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed rounded-lg">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No emails found</p>
        <p className="text-sm text-muted-foreground">
          Sync your Gmail to see communications with this client
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Email Communications ({emails.length})</h3>
      </div>

      <div className="space-y-3">
        {emails.map((email) => (
          <div
            key={email.id}
            className="p-4 border rounded-lg bg-card hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {email.direction === "incoming" ? (
                  <ArrowDownLeft className="h-4 w-4 text-primary" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-accent-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={email.direction === "incoming" ? "secondary" : "outline"}>
                    {email.direction === "incoming" ? "Received" : "Sent"}
                  </Badge>
                  {email.is_read === false && (
                    <Badge variant="default">Unread</Badge>
                  )}
                </div>
                <p className="font-medium text-sm truncate">
                  {email.subject || "(No subject)"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {email.direction === "incoming" ? "From: " : "To: "}
                  {email.direction === "incoming" ? email.from_email : email.to_email}
                </p>
                {(email.snippet || email.body_preview) && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {email.snippet || email.body_preview}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  {format(new Date(email.received_at), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientCommunicationsView;
