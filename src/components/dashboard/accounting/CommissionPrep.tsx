import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateCheckPdf } from "@/utils/generateCheckPdf";
import type { CheckLineItem } from "@/utils/generateCheckPdf";

interface CommissionPrepProps {
  onBack: () => void;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

const CommissionPrep = ({ onBack }: CommissionPrepProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch payouts that are not yet paid
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

  // Fetch all payout_closing_links with closing details
  const payoutIds = payouts.map(p => p.id);
  const { data: allLinks = [] } = useQuery({
    queryKey: ["accounting-payout-links", payoutIds],
    queryFn: async () => {
      if (payoutIds.length === 0) return [];
      const { data, error } = await supabase
        .from("payout_closing_links")
        .select("*, closings(id, property_address, closing_date, agent_share, caliber_title_bonus, caliber_title_amount, agent_name)")
        .in("payout_id", payoutIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && payoutIds.length > 0,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-payout-links"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-pending-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
  };

  const removeClosingFromPayout = async (linkId: string, payoutId: string, agentShare: number) => {
    try {
      // Delete the link
      await supabase.from("payout_closing_links").delete().eq("id", linkId);

      // Check remaining links for this payout
      const { data: remaining } = await supabase
        .from("payout_closing_links")
        .select("agent_share")
        .eq("payout_id", payoutId);

      if (!remaining || remaining.length === 0) {
        // No closings left, delete the payout entirely
        await supabase.from("commission_payouts").delete().eq("id", payoutId);
        toast.success("Last closing removed — payout deleted.");
      } else {
        // Update payout total
        const newTotal = remaining.reduce((sum, l) => sum + Number(l.agent_share), 0);
        await supabase.from("commission_payouts").update({ total_amount: newTotal }).eq("id", payoutId);
        toast.success("Closing removed from check.");
      }

      invalidateAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove closing");
    }
  };

  const deletePayout = async (payoutId: string) => {
    try {
      await supabase.from("payout_closing_links").delete().eq("payout_id", payoutId);
      const { error } = await supabase.from("commission_payouts").delete().eq("id", payoutId);
      if (error) throw error;
      toast.success("Payout deleted.");
      invalidateAll();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete payout");
    }
  };

  const markPaid = async (payoutId: string) => {
    await supabase.from("commission_payouts").update({ status: "paid", payout_date: new Date().toISOString().split("T")[0] }).eq("id", payoutId);
    toast.success("Payout marked as paid.");
    invalidateAll();
  };

  const handlePrintCheck = async (payoutId: string, agentName: string, totalAmount: number) => {
    try {
      const payoutLinks = allLinks.filter(l => l.payout_id === payoutId);
      const closingsData = payoutLinks.map((l: any) => l.closings).filter(Boolean);

      const { data: agentData } = await supabase
        .from("agents")
        .select("home_address, city, state, zip")
        .eq("full_name", agentName)
        .maybeSingle();

      const lineItems: CheckLineItem[] = [];
      const propertyNames: string[] = [];
      closingsData.forEach((c: any) => {
        propertyNames.push(c.property_address);
        lineItems.push({ amount: Number(c.agent_share), label: c.property_address });
        if (c.caliber_title_bonus) {
          lineItems.push({ amount: Number(c.caliber_title_amount), label: `${c.property_address} Bonus` });
        }
      });

      const yearStart = new Date().getFullYear() + "-01-01";
      const { data: ytdPayouts } = await supabase
        .from("commission_payouts")
        .select("total_amount")
        .eq("agent_name", agentName)
        .gte("created_at", yearStart);
      const ytdTotal = (ytdPayouts || []).reduce((sum, p) => sum + Number(p.total_amount), 0);

      generateCheckPdf({
        date: format(new Date(), "MMMM d, yyyy"),
        totalAmount: totalAmount,
        agentName: agentName,
        agentAddress: agentData?.home_address || "",
        agentCityStateZip: agentData ? `${agentData.city || ""}, ${agentData.state || ""} ${agentData.zip || ""}` : "",
        propertyNames: propertyNames.join("/"),
        lineItems,
        ytdTotal,
      });

      toast.success("Check PDF generated.");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate check PDF");
    }
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
        <p className="text-sm text-muted-foreground">Review and print agent commission checks</p>
      </div>

      {/* Checks Ready to Print */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Checks Ready to Print</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No checks ready to print.</p>
          ) : (
            <div className="space-y-6">
              {payouts.map(payout => {
                const payoutLinks = allLinks.filter(l => l.payout_id === payout.id);
                return (
                  <Card key={payout.id} className="border shadow-none">
                    <CardContent className="pt-5">
                      {/* Payout header */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="font-semibold text-base">{payout.agent_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {payout.created_at ? format(new Date(payout.created_at), "MMM d, yyyy") : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-xl font-semibold">{formatCurrency(Number(payout.total_amount))}</p>
                          {statusBadge(payout.status)}
                        </div>
                      </div>

                      {/* Linked closings */}
                      {payoutLinks.length > 0 && (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Property</TableHead>
                              <TableHead>Closing Date</TableHead>
                              <TableHead className="text-right">Agent Share</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payoutLinks.map((link: any) => {
                              const closing = link.closings;
                              if (!closing) return null;
                              return (
                                <TableRow key={link.id}>
                                  <TableCell className="font-medium">{closing.property_address}</TableCell>
                                  <TableCell>{format(new Date(closing.closing_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(Number(closing.agent_share))}</TableCell>
                                  <TableCell>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                          <Trash2 className="w-4 h-4" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove from Check</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Remove {closing.property_address} from this check? The check total will be updated automatically.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => removeClosingFromPayout(link.id, payout.id, Number(link.agent_share))}
                                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                          >
                                            Remove
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}

                      {/* Actions */}
                      <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                        <Button variant="ghost" size="sm" onClick={() => handlePrintCheck(payout.id, payout.agent_name, Number(payout.total_amount))}>
                          <FileDown className="w-4 h-4 mr-1" /> PDF
                        </Button>
                        {payout.status !== "paid" && (
                          <Button variant="ghost" size="sm" onClick={() => markPaid(payout.id)}>Mark Paid</Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="w-4 h-4 mr-1" /> Delete Check
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Check</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete this check for {payout.agent_name} ({formatCurrency(Number(payout.total_amount))}). This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deletePayout(payout.id)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CommissionPrep;
