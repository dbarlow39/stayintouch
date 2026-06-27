import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Loader2, Send, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  leadId: string;
  leadEmail: string | null;
}

interface LoveRow {
  id: string;
  token: string;
  sent_at: string | null;
  submitted_at: string | null;
  responses: string[] | null;
  token_expires_at: string;
}

const LoveResponsesTab = ({ leadId, leadEmail }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [row, setRow] = useState<LoveRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lead_love_responses")
      .select("id, token, sent_at, submitted_at, responses, token_expires_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRow((data as any) || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [leadId]);

  const handleSend = async () => {
    if (!leadEmail) {
      toast({ title: "Lead has no email address", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-love-questionnaire", {
        body: { lead_id: leadId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Questionnaire sent", description: `Email delivered to ${leadEmail}.` });
      await load();
    } catch (e: any) {
      toast({ title: "Send failed", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const copyLink = async (token: string) => {
    const link = `https://10thingsilove.sellfor1percent.com/love/${token}`;
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copied" });
  };

  const responses = row?.responses && Array.isArray(row.responses) ? row.responses : [];

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-emerald-600" />
            10 Things They Love
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Email the seller a branded questionnaire asking for the 10 emotional reasons they love their home. Their answers populate below and are automatically fed into the MLS Description generator.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSend} disabled={sending || !leadEmail} className="bg-emerald-600 hover:bg-emerald-700">
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {row?.sent_at ? "Resend questionnaire" : "Send questionnaire"}
            </Button>
            {!leadEmail && (
              <span className="text-xs text-destructive">Add an email address to the lead first.</span>
            )}
            {row?.token && !row.submitted_at && (
              <>
                <Button variant="outline" size="sm" onClick={() => copyLink(row.token)}>
                  <Copy className="w-3 h-3 mr-1" /> Copy link
                </Button>
                <a
                  href={`https://10thingsilove.sellfor1percent.com/love/${row.token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 inline-flex items-center gap-1 hover:underline"
                >
                  Open form <ExternalLink className="w-3 h-3" />
                </a>
              </>
            )}
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="w-4 h-4 inline animate-spin mr-2" />Loading…</div>
          ) : !row ? (
            <p className="text-sm text-muted-foreground">No questionnaire sent yet.</p>
          ) : (
            <div className="text-xs text-muted-foreground space-y-1">
              {row.sent_at && <div>Sent: {new Date(row.sent_at).toLocaleString()}</div>}
              {row.submitted_at
                ? <div className="text-emerald-700 font-medium">Submitted: {new Date(row.submitted_at).toLocaleString()}</div>
                : <div>Waiting for the seller's response. Link expires {new Date(row.token_expires_at).toLocaleDateString()}.</div>}
            </div>
          )}
        </CardContent>
      </Card>

      {responses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seller's responses</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 list-decimal pl-5">
              {responses.map((r, i) => (
                <li key={i} className="text-sm leading-relaxed">{r}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LoveResponsesTab;
