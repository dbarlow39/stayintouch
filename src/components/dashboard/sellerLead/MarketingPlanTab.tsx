import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Sparkles, Copy, Printer } from "lucide-react";

export default function MarketingPlanTab({ lead }: { lead: any }) {
  const [loading, setLoading] = useState(false);
  const [markdown, setMarkdown] = useState<string>("");

  const fullAddress = [lead?.address, lead?.city, lead?.state, lead?.zip]
    .filter(Boolean)
    .join(", ");

  const generate = async () => {
    if (!lead?.id) {
      toast({ title: "No lead selected", variant: "destructive" });
      return;
    }
    if (!fullAddress) {
      toast({ title: "Lead has no address", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate-listing-marketing-plan",
        { body: { leadId: lead.id } },
      );
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setMarkdown((data as any)?.markdown || "");
    } catch (e: any) {
      toast({
        title: "Failed to generate marketing plan",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const print = () => window.print();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Marketing Plan</h2>
          <p className="text-sm text-muted-foreground">
            {fullAddress || "No address on this lead."}
          </p>
        </div>
        <div className="flex gap-2">
          {markdown && (
            <>
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="h-4 w-4 mr-2" /> Copy
              </Button>
              <Button variant="outline" size="sm" onClick={print}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
            </>
          )}
          <Button onClick={generate} disabled={loading || !fullAddress}>
            {loading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> {markdown ? "Regenerate" : "Generate Marketing Plan"}</>
            )}
          </Button>
        </div>
      </div>

      {loading && !markdown && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Building your marketing plan. This usually takes 30–60 seconds.
        </Card>
      )}

      {markdown && (
        <Card className="p-6">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{markdown}</ReactMarkdown>
          </div>
        </Card>
      )}

      {!markdown && !loading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Click "Generate Marketing Plan" to build a full plan for this listing.
        </Card>
      )}
    </div>
  );
}
