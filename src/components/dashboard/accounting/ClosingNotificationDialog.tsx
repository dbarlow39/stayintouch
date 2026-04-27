import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ClosingNotificationDialogProps {
  open: boolean;
  onClose: () => void;
  agentName: string;
  defaultEmail: string;
  propertyAddress: string;
  paperworkReceived: boolean;
  checkReceived: boolean;
}

const ClosingNotificationDialog = ({
  open,
  onClose,
  agentName,
  defaultEmail,
  propertyAddress,
  paperworkReceived,
  checkReceived,
}: ClosingNotificationDialogProps) => {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setEmail(defaultEmail);
  }, [open, defaultEmail]);

  const items: string[] = [];
  if (paperworkReceived) items.push("paperwork");
  if (checkReceived) items.push("check");
  const summary = items.join(" and ");

  const handleSend = async () => {
    if (!email) {
      toast.error("Recipient email required");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-closing-notification", {
        body: {
          recipientEmail: email,
          agentName,
          propertyAddress,
          paperworkReceived,
          checkReceived,
        },
      });
      if (error) throw error;
      toast.success(`Notification sent to ${email}`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notify {agentName || "agent"}?</DialogTitle>
          <DialogDescription>
            Send an email letting {agentName || "the agent"} know we've received the {summary}
            {propertyAddress ? ` for ${propertyAddress}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Recipient Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="agent@example.com"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Skip
          </Button>
          <Button onClick={handleSend} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700">
            {sending ? "Sending..." : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClosingNotificationDialog;
