import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";
import { Mail, ArrowDownLeft, ArrowUpRight, Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ClientActivityLogProps {
  clientId: string;
  clientEmail: string | null | undefined;
  propertyAddress?: string | null;
}

interface LogEntry {
  id: string;
  kind: "email" | "notice";
  direction?: string;
  who: string;
  description: string;
  at: string;
}

const escape = (s: string) => s.replace(/,/g, " ").replace(/[()]/g, " ");

const ClientActivityLog = ({ clientId, clientEmail, propertyAddress }: ClientActivityLogProps) => {
  const { user } = useAuth();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["client-activity-log", clientId, clientEmail, propertyAddress],
    queryFn: async () => {
      const results: LogEntry[] = [];

      // ---- Emails ----
      const emailList = (clientEmail || "").split(",").map((e) => e.trim()).filter(Boolean);
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

      if (orParts.length > 0 && user) {
        const { data } = await supabase
          .from("client_email_logs")
          .select("id, direction, from_email, to_email, subject, snippet, body_preview, received_at")
          .eq("agent_id", user.id)
          .or(orParts.join(","))
          .order("received_at", { ascending: false });

        for (const e of data || []) {
          const fromLower = (e.from_email || "").toLowerCase();
          if (fromLower.includes("showingtime") || fromLower.includes("showing.com")) continue;
          results.push({
            id: `email-${e.id}`,
            kind: "email",
            direction: e.direction,
            who: e.direction === "incoming" ? e.from_email : e.to_email,
            description: e.subject || e.snippet || e.body_preview || "(No subject)",
            at: e.received_at,
          });
        }
      }

      // ---- Notices ----
      // Match working deals by client link OR by street address, so notices
      // still show when the deal was never linked to the client record.
      const { data: propsByClient } = await supabase
        .from("estimated_net_properties")
        .select("id")
        .eq("client_id", clientId);

      const propIdSet = new Set((propsByClient || []).map((p) => p.id));

      if (addr && user) {
        const street = addr.split(",")[0].trim();
        if (street) {
          const { data: propsByAddr } = await supabase
            .from("estimated_net_properties")
            .select("id")
            .eq("agent_id", user.id)
            .ilike("street_address", `%${escape(street)}%`);
          for (const p of propsByAddr || []) propIdSet.add(p.id);
        }
      }

      const propIds = Array.from(propIdSet);

      if (propIds.length > 0) {
        const { data: notices } = await supabase
          .from("property_notice_status")
          .select("id, notice_type, completed, completed_at")
          .in("property_id", propIds)
          .eq("completed", true);

        for (const n of notices || []) {
          results.push({
            id: `notice-${n.id}`,
            kind: "notice",
            who: user?.email || "You",
            description: `Notice sent: ${n.notice_type}`,
            at: n.completed_at || new Date().toISOString(),
          });
        }
      }

      // ---- Weekly market updates ----
      const { data: weekly } = await supabase
        .from("weekly_email_logs")
        .select("id, subject, sent_at")
        .eq("client_id", clientId)
        .order("sent_at", { ascending: false });

      for (const w of weekly || []) {
        results.push({
          id: `weekly-${w.id}`,
          kind: "email",
          direction: "outgoing",
          who: (clientEmail || "client") as string,
          description: w.subject || "Weekly Market Update",
          at: w.sent_at,
        });
      }

      return results.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
    enabled: !!user && !!clientId,
  });

  if (isLoading) {
    return <div className="text-center py-4 text-muted-foreground">Loading activity log...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed rounded-lg">
        <Mail className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No logged emails or notices yet</p>
        <p className="text-sm text-muted-foreground">
          Sent and received emails appear here after Gmail sync
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <div key={entry.id} className="p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {entry.kind === "notice" ? (
                <Bell className="h-4 w-4 text-primary" />
              ) : entry.direction === "incoming" ? (
                <ArrowDownLeft className="h-4 w-4 text-primary" />
              ) : (
                <ArrowUpRight className="h-4 w-4 text-accent-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={entry.kind === "notice" ? "default" : entry.direction === "incoming" ? "secondary" : "outline"}>
                  {entry.kind === "notice" ? "Notice" : entry.direction === "incoming" ? "Received" : "Sent"}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {entry.kind === "notice" ? "by " : entry.direction === "incoming" ? "from " : "to "}
                  {entry.who}
                </span>
              </div>
              <p className="text-sm font-medium break-words">{entry.description}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(entry.at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ClientActivityLog;
