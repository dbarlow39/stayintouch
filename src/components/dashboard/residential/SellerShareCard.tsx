import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Mail, Loader2, Share2, Ban } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { openEmailClient } from "@/utils/emailClientUtils";

interface AccessCode {
  id: string;
  code: string;
  expires_at: string;
  revoked: boolean;
  last_opened_at: string | null;
  submitted_at: string | null;
}

interface SellerShareCardProps {
  inspectionId: string | null;
  agentId: string;
  propertyAddress: string;
  sellerEmail?: string;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alike characters

const makeCode = () => {
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
};

const fmt = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

export const SellerShareCard = ({ inspectionId, agentId, propertyAddress, sellerEmail }: SellerShareCardProps) => {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [busy, setBusy] = useState(false);

  const shareUrl = (_code?: string) => `https://myhome.sellfor1percent.com`;

  const load = async () => {
    if (!inspectionId) { setCodes([]); return; }
    const { data } = await supabase
      .from("worksheet_access_codes")
      .select("id, code, expires_at, revoked, last_opened_at, submitted_at")
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: false });
    setCodes(
      (data || []).map((c) => ({
        ...c,
        code: c.code.length === 8 ? `${c.code.slice(0, 4)}-${c.code.slice(4)}` : c.code,
      })),
    );
  };

  useEffect(() => { void load(); }, [inspectionId]);

  const handleGenerate = async () => {
    if (!inspectionId) {
      toast.error("Save the work sheet first, then share it with the seller.");
      return;
    }
    setBusy(true);
    try {
      const plain = makeCode().replace(/-/g, "");
      const { error } = await supabase.from("worksheet_access_codes").insert({
        inspection_id: inspectionId,
        agent_id: agentId,
        code: plain,
        property_address: propertyAddress || null,
      });
      if (error) throw error;
      await load();
      toast.success("Access code created");
    } catch (e: any) {
      toast.error(e.message || "Could not create a code");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string) => {
    const { error } = await supabase.from("worksheet_access_codes").update({ revoked: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await load();
    toast.success("Code revoked");
  };

  const handleCopy = async (code: string) => {
    const text =
      `Here's the link to fill in the details about your home:\n\n${shareUrl()}\n\n` +
      `Your access code is: ${code}\n\n` +
      `Enter that code on the page to open your home information sheet.\n\n` +
      `Fill in whatever you know, add a few photos of each area, and click "Send to My Agent" when you're done. ` +
      `You can stop and come back any time with the same code.`;
    await navigator.clipboard.writeText(text);
    toast.success("Link and instructions copied");
  };

  const handleEmail = async (code: string) => {
    await handleCopy(code);
    openEmailClient(
      sellerEmail || "",
      undefined,
      `Your home information sheet${propertyAddress ? ` – ${propertyAddress}` : ""}`,
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4 text-[#9B111E]" />
          Share with Seller
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Give the seller a code so they can fill in this same work sheet and upload their own photos.
        </p>

        {codes.map((c) => {
          const expired = new Date(c.expires_at) < new Date();
          const dead = c.revoked || expired;
          return (
            <div key={c.id} className={`rounded-md border p-3 ${dead ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-lg font-semibold tracking-wider">{c.code}</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={dead} onClick={() => handleCopy(c.code)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />Copy
                  </Button>
                  <Button size="sm" variant="outline" disabled={dead} onClick={() => handleEmail(c.code)}>
                    <Mail className="mr-1 h-3.5 w-3.5" />Email
                  </Button>
                  {!dead && (
                    <Button size="sm" variant="ghost" onClick={() => handleRevoke(c.id)}>
                      <Ban className="mr-1 h-3.5 w-3.5" />Revoke
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {c.revoked
                  ? "Revoked"
                  : expired
                    ? "Expired"
                    : `Expires ${new Date(c.expires_at).toLocaleDateString()}`}
                {c.last_opened_at && ` • Opened ${fmt(c.last_opened_at)}`}
                {c.submitted_at && ` • Submitted ${fmt(c.submitted_at)}`}
              </div>
            </div>
          );
        })}

        <Button onClick={handleGenerate} disabled={busy} className="bg-[#9B111E] hover:bg-[#7A0D17] text-white">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
          Create Access Code
        </Button>
      </CardContent>
    </Card>
  );
};
