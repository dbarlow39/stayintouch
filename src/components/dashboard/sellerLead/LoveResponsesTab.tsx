import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Loader2, Send, Copy, ExternalLink, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { openEmailClient } from "@/utils/emailClientUtils";

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
  const [drafting, setDrafting] = useState(false);
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

  const handleCopyAndEmail = async () => {
    if (!leadEmail) {
      toast({ title: "Lead has no email address", variant: "destructive" });
      return;
    }
    setDrafting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-love-questionnaire", {
        body: { lead_id: leadId, mode: "draft" },
      });
      if (error) throw error;
      const d = data as any;
      if (d?.error) throw new Error(d.error);
      const html: string = d.html;
      const subject: string = d.subject;
      const to: string = d.to;
      const plain = html.replace(/<[^>]+>/g, "").replace(/\s+\n/g, "\n").trim();
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      toast({ title: "Copied — opening Gmail", description: "Paste into the Gmail compose window." });
      openEmailClient(to, "gmail", subject);
      await load();
    } catch (e: any) {
      toast({ title: "Copy failed", description: e.message, variant: "destructive" });
    } finally {
      setDrafting(false);
    }
  };


  const responses = row?.responses && Array.isArray(row.responses) ? row.responses : [];

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-[#9B111E]" />
            10 Things They Love
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Email the seller a branded questionnaire asking for the 10 emotional reasons they love their home. Their answers populate below and are automatically fed into the MLS Description generator.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSend} disabled={sending || !leadEmail} className="bg-[#9B111E] hover:bg-[#7A0D17] text-white">
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
                  className="text-xs text-[#9B111E] inline-flex items-center gap-1 hover:underline"
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
                ? <div className="text-[#9B111E] font-medium">Submitted: {new Date(row.submitted_at).toLocaleString()}</div>
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
