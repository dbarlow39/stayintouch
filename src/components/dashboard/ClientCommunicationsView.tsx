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
}

const ClientCommunicationsView = ({ clientEmail }: ClientCommunicationsViewProps) => {
  const { user } = useAuth();

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["client-communications", clientEmail],
    queryFn: async () => {
      if (!clientEmail) return [];
      
      const { data, error } = await supabase
        .from("client_email_logs")
        .select("*")
        .eq("agent_id", user!.id)
        .or(`from_email.ilike.%${clientEmail}%,to_email.ilike.%${clientEmail}%`)
        .order("received_at", { ascending: false });
      
      if (error) throw error;
      return data as ClientEmail[];
    },
    enabled: !!clientEmail && !!user,
  });

  if (!clientEmail) {
    return (
      <div className="text-center py-8 border border-dashed rounded-lg">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No email address on file</p>
        <p className="text-sm text-muted-foreground">
          Add an email address to see communications
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
