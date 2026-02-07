import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Closing {
  id: string;
  agent_name: string;
  agent_id: string;
  property_address: string;
  closing_date: string;
  total_commission: number;
  agent_share: number;
  caliber_title_bonus: boolean;
  caliber_title_amount: number;
}

interface ReadyToPayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closings: Closing[];
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

const ReadyToPayDialog = ({ open, onOpenChange, closings }: ReadyToPayDialogProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);

  // Group selected closings by agent
  const byAgent = closings.reduce<Record<string, Closing[]>>((acc, c) => {
    acc[c.agent_name] = acc[c.agent_name] || [];
    acc[c.agent_name].push(c);
    return acc;
  }, {});

  const agents = Object.entries(byAgent);

  const handleGenerateChecks = async () => {
    if (!user) return;
    setCreating(true);
    try {
      for (const [agentName, agentClosings] of agents) {
        const totalPayout = agentClosings.reduce((sum, c) => sum + Number(c.agent_share), 0);

        const { data: payout, error } = await supabase.from("commission_payouts").insert({
          agent_id: agentClosings[0].agent_id,
          agent_name: agentName,
          total_amount: totalPayout,
          status: "approved",
          created_by: user.id,
        }).select().single();
        if (error) throw error;

        const links = agentClosings.map(c => ({
          payout_id: payout.id,
          closing_id: c.id,
          agent_share: Number(c.agent_share),
        }));
        await supabase.from("payout_closing_links").insert(links);
        await supabase.from("closings").update({ status: "processed" }).in("id", agentClosings.map(c => c.id));
      }

      toast.success("Commission checks prepared successfully.");
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-pending-payouts"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to create payouts");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Prepare Commission Checks</DialogTitle>
          <DialogDescription>
            Review the selected closings below and generate commission checks for each agent.
          </DialogDescription>
        </DialogHeader>

        {agents.map(([agentName, agentClosings]) => {
          const total = agentClosings.reduce((s, c) => s + Number(c.agent_share), 0);
          const bonus = agentClosings.filter(c => c.caliber_title_bonus).reduce((s, c) => s + Number(c.caliber_title_amount), 0);
          return (
            <div key={agentName} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-base">{agentName}</h3>
                <Badge className="bg-emerald-100 text-emerald-800 border-0 text-sm">
                  Total: {formatCurrency(total)}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead>Closing Date</TableHead>
                    <TableHead className="text-right">Agent Share</TableHead>
                    <TableHead className="text-right">Caliber Bonus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentClosings.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.property_address}</TableCell>
                      <TableCell>{format(new Date(c.closing_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(c.agent_share))}</TableCell>
                      <TableCell className="text-right">
                        {c.caliber_title_bonus ? formatCurrency(Number(c.caliber_title_amount)) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {bonus > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Includes {formatCurrency(bonus)} Caliber Title Bonus (separate line item on check)
                </p>
              )}
            </div>
          );
        })}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleGenerateChecks}
            disabled={creating}
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
          >
            <Printer className="w-4 h-4 mr-2" />
            {creating ? "Generating…" : "Generate Checks"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReadyToPayDialog;
