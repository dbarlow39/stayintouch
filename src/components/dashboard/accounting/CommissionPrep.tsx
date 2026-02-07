import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface CommissionPrepProps {
  onBack: () => void;
}

const CommissionPrep = ({ onBack }: CommissionPrepProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Get closings with checks received that haven't been paid yet
  const { data: readyClosings = [] } = useQuery({
    queryKey: ["accounting-ready-closings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closings")
        .select("*")
        .in("status", ["check_received", "processed"])
        .order("agent_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ["accounting-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedClosings = readyClosings.filter(c => selectedIds.includes(c.id));
  const totalPayout = selectedClosings.reduce((sum, c) => sum + Number(c.agent_share), 0);
  const agentName = selectedClosings.length > 0 ? selectedClosings[0].agent_name : "";

  // Check if all selected are same agent
  const sameAgent = selectedClosings.every(c => c.agent_name === agentName);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const handleCreatePayout = async () => {
    if (!user || selectedIds.length === 0) return;
    if (!sameAgent) {
      toast.error("Please select closings for one agent at a time.");
      return;
    }
    setCreating(true);
    try {
      const { data: payout, error } = await supabase.from("commission_payouts").insert({
        agent_id: selectedClosings[0].agent_id,
        agent_name: agentName,
        total_amount: totalPayout,
        status: "approved",
        created_by: user.id,
      }).select().single();
      if (error) throw error;

      // Link closings to payout
      const links = selectedIds.map(closingId => ({
        payout_id: payout.id,
        closing_id: closingId,
        agent_share: Number(readyClosings.find(c => c.id === closingId)?.agent_share || 0),
      }));
      await supabase.from("payout_closing_links").insert(links);

      // Update closing statuses
      await supabase.from("closings").update({ status: "processed" }).in("id", selectedIds);

      toast.success("All clear—ready to print your agent's check.");
      queryClient.invalidateQueries({ queryKey: ["accounting-ready-closings"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to create payout");
    } finally {
      setCreating(false);
    }
  };

  const markPaid = async (payoutId: string) => {
    await supabase.from("commission_payouts").update({ status: "paid", payout_date: new Date().toISOString().split("T")[0] }).eq("id", payoutId);
    toast.success("Payout marked as paid.");
    queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-pending-payouts"] });
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: "bg-amber-100 text-amber-800",
      approved: "bg-blue-100 text-blue-800",
      printed: "bg-indigo-100 text-indigo-800",
      paid: "bg-emerald-100 text-emerald-800",
    };
    return <Badge className={`border-0 ${variants[status] || ""}`}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Button>

      <div>
        <h2 className="text-xl font-medium">Commission Prep</h2>
        <p className="text-sm text-muted-foreground">Select closings to prepare agent payouts</p>
      </div>

      {/* Select Closings */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Ready for Payout</CardTitle>
          <CardDescription>Select closings for the same agent, then generate their check</CardDescription>
        </CardHeader>
        <CardContent>
          {readyClosings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No closings ready for payout yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Closing Date</TableHead>
                      <TableHead className="text-right">Agent Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readyClosings.map(closing => (
                      <TableRow key={closing.id} className="cursor-pointer" onClick={() => toggleSelect(closing.id)}>
                        <TableCell>
                          <Checkbox checked={selectedIds.includes(closing.id)} onCheckedChange={() => toggleSelect(closing.id)} />
                        </TableCell>
                        <TableCell className="font-medium">{closing.agent_name}</TableCell>
                        <TableCell>{closing.property_address}</TableCell>
                        <TableCell>{format(new Date(closing.closing_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">{formatCurrency(Number(closing.agent_share))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedIds.length > 0 && (
                <div className="mt-6 bg-emerald-50 rounded-lg p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Payout for <strong>{agentName}</strong></p>
                    <p className="text-2xl font-semibold text-emerald-800">{formatCurrency(totalPayout)}</p>
                    {!sameAgent && <p className="text-xs text-red-600 mt-1">⚠ Select closings for one agent only</p>}
                  </div>
                  <Button
                    onClick={handleCreatePayout}
                    disabled={creating || !sameAgent}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    <Printer className="w-4 h-4 mr-2" /> Generate Check
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Payouts */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Recent Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No payouts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map(payout => (
                    <TableRow key={payout.id}>
                      <TableCell className="font-medium">{payout.agent_name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(payout.total_amount))}</TableCell>
                      <TableCell>{payout.payout_date ? format(new Date(payout.payout_date + "T00:00:00"), "MMM d, yyyy") : "—"}</TableCell>
                      <TableCell>{statusBadge(payout.status)}</TableCell>
                      <TableCell>
                        {payout.status !== "paid" && (
                          <Button variant="ghost" size="sm" onClick={() => markPaid(payout.id)}>Mark Paid</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CommissionPrep;
