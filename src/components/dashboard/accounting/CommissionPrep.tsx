import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Printer, Trash2, FileDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateCheckPdf } from "@/utils/generateCheckPdf";
import type { CheckLineItem } from "@/utils/generateCheckPdf";

interface CommissionPrepProps {
  onBack: () => void;
}

const CommissionPrep = ({ onBack }: CommissionPrepProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Get closings that are linked to unpaid payouts (i.e. actually marked "Ready to Pay")
  const { data: readyClosings = [] } = useQuery({
    queryKey: ["accounting-ready-closings"],
    queryFn: async () => {
      // Get closing IDs linked to non-paid payouts
      const { data: links, error: linksError } = await supabase
        .from("payout_closing_links")
        .select("closing_id, payout_id");
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      // Get payouts that are NOT paid yet
      const payoutIds = [...new Set(links.map(l => l.payout_id))];
      const { data: payouts, error: payoutsError } = await supabase
        .from("commission_payouts")
        .select("id")
        .in("id", payoutIds)
        .neq("status", "paid");
      if (payoutsError) throw payoutsError;

      const unpaidPayoutIds = new Set((payouts || []).map(p => p.id));
      const closingIds = links
        .filter(l => unpaidPayoutIds.has(l.payout_id))
        .map(l => l.closing_id);
      if (closingIds.length === 0) return [];

      const { data, error } = await supabase
        .from("closings")
        .select("*")
        .in("id", closingIds)
        .eq("paid", false)
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

  // Fetch linked closings for each payout to show property addresses
  const payoutIds = payouts.map(p => p.id);
  const { data: payoutLinks = [] } = useQuery({
    queryKey: ["accounting-payout-links", payoutIds],
    queryFn: async () => {
      if (payoutIds.length === 0) return [];
      const { data: links, error: linksError } = await supabase
        .from("payout_closing_links")
        .select("payout_id, closing_id")
        .in("payout_id", payoutIds);
      if (linksError) throw linksError;
      if (!links || links.length === 0) return [];

      const closingIds = [...new Set(links.map(l => l.closing_id))];
      const { data: closingsData, error: closingsError } = await supabase
        .from("closings")
        .select("id, property_address")
        .in("id", closingIds);
      if (closingsError) throw closingsError;

      const closingMap = new Map((closingsData || []).map(c => [c.id, c.property_address]));
      return links.map(l => ({ payout_id: l.payout_id, property_address: closingMap.get(l.closing_id) || "" }));
    },
    enabled: !!user && payoutIds.length > 0,
  });

  const getPayoutProperties = (payoutId: string): string => {
    const addresses = payoutLinks
      .filter(l => l.payout_id === payoutId && l.property_address)
      .map(l => l.property_address);
    return addresses.join(", ");
  };

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

      toast.success("All clear—ready to print your agent's check.");
      queryClient.invalidateQueries({ queryKey: ["accounting-ready-closings"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-payout-links"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err.message || "Failed to create payout");
    } finally {
      setCreating(false);
    }
  };

  const markPaid = async (payoutId: string) => {
    // Mark the payout as paid
    await supabase.from("commission_payouts").update({ status: "paid", payout_date: new Date().toISOString().split("T")[0] }).eq("id", payoutId);
    
    // Also mark all linked closings as paid
    const { data: links } = await supabase
      .from("payout_closing_links")
      .select("closing_id")
      .eq("payout_id", payoutId);
    if (links && links.length > 0) {
      const closingIds = links.map(l => l.closing_id);
      await supabase.from("closings").update({ paid: true }).in("id", closingIds);
    }

    toast.success("Payout marked as paid.");
    queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-pending-payouts"] });
    queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
  };

  const deletePayout = async (payoutId: string) => {
    try {
      // Delete linked closing references first
      await supabase.from("payout_closing_links").delete().eq("payout_id", payoutId);
      // Delete the payout record
      const { error } = await supabase.from("commission_payouts").delete().eq("id", payoutId);
      if (error) throw error;
      toast.success("Payout deleted.");
      queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-pending-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-ready-closings"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to delete payout");
    }
  };

  const handlePrintCheck = async (payoutId: string, agentName: string, totalAmount: number) => {
    try {
      // Get linked closings for this payout
      const { data: links, error: linksError } = await supabase
        .from("payout_closing_links")
        .select("closing_id, agent_share")
        .eq("payout_id", payoutId);
      if (linksError) throw linksError;

      const closingIds = (links || []).map(l => l.closing_id);
      const { data: closingsData, error: closingsError } = await supabase
        .from("closings")
        .select("property_address, agent_share, caliber_title_bonus, caliber_title_amount")
        .in("id", closingIds);
      if (closingsError) throw closingsError;

      // Get agent address
      const { data: agentData } = await supabase
        .from("agents")
        .select("home_address, city, state, zip")
        .eq("full_name", agentName)
        .maybeSingle();

      // Build line items: each property + bonus if applicable
      const lineItems: CheckLineItem[] = [];
      const propertyNames: string[] = [];
      const stripStreetNumber = (addr: string) => addr.replace(/^\d+\s+/, "");
      (closingsData || []).forEach(c => {
        propertyNames.push(stripStreetNumber(c.property_address));
        lineItems.push({ amount: Number(c.agent_share), label: c.property_address });
        if (c.caliber_title_bonus) {
          lineItems.push({ amount: Number(c.caliber_title_amount), label: `${c.property_address} Bonus` });
        }
      });

      // Calculate YTD: sum all paid/approved payouts for this agent this year
      const yearStart = new Date().getFullYear() + "-01-01";
      const { data: ytdPayouts } = await supabase
        .from("commission_payouts")
        .select("total_amount")
        .eq("agent_name", agentName)
        .gte("created_at", yearStart);
      const ytdTotal = (ytdPayouts || []).reduce((sum, p) => sum + Number(p.total_amount), 0);

      const today = format(new Date(), "MMMM d, yyyy");

      generateCheckPdf({
        date: today,
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
      approved: "bg-emerald-100 text-emerald-800",
      printed: "bg-indigo-100 text-indigo-800",
      paid: "bg-emerald-100 text-emerald-800",
    };
    const labels: Record<string, string> = {
      approved: "Ready to Print",
    };
    return <Badge className={`border-0 ${variants[status] || ""}`}>{labels[status] || status}</Badge>;
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
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readyClosings.map(closing => (
                      <TableRow key={closing.id} className="cursor-pointer" onClick={() => toggleSelect(closing.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.includes(closing.id)} onCheckedChange={() => toggleSelect(closing.id)} onClick={(e) => e.stopPropagation()} />
                        </TableCell>
                        <TableCell className="font-medium">{closing.agent_name}</TableCell>
                        <TableCell>{closing.property_address}</TableCell>
                        <TableCell>{format(new Date(closing.closing_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">{formatCurrency(Number(closing.agent_share))}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove from Payout</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove {closing.property_address} ({closing.agent_name}) from the payout list. The closing record will NOT be deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    try {
                                      // Find which payout this closing belongs to
                                      const { data: linkData } = await supabase
                                        .from("payout_closing_links")
                                        .select("payout_id, agent_share")
                                        .eq("closing_id", closing.id);
                                      
                                      // Remove the payout link
                                      const { error } = await supabase.from("payout_closing_links").delete().eq("closing_id", closing.id);
                                      if (error) throw error;

                                      // For each affected payout, check remaining links and update/delete
                                      if (linkData) {
                                        for (const link of linkData) {
                                          const { data: remaining } = await supabase
                                            .from("payout_closing_links")
                                            .select("agent_share")
                                            .eq("payout_id", link.payout_id);
                                          
                                          if (!remaining || remaining.length === 0) {
                                            // No closings left — delete the payout
                                            await supabase.from("commission_payouts").delete().eq("id", link.payout_id);
                                          } else {
                                            // Recalculate payout total
                                            const newTotal = remaining.reduce((sum, r) => sum + Number(r.agent_share), 0);
                                            await supabase.from("commission_payouts").update({ total_amount: newTotal }).eq("id", link.payout_id);
                                          }
                                        }
                                      }

                                      toast.success("Removed from payout list.");
                                      setSelectedIds(prev => prev.filter(x => x !== closing.id));
                                      queryClient.invalidateQueries({ queryKey: ["accounting-ready-closings"] });
                                      queryClient.invalidateQueries({ queryKey: ["accounting-payouts"] });
                                      queryClient.invalidateQueries({ queryKey: ["accounting-pending-payouts"] });
                                      queryClient.invalidateQueries({ queryKey: ["accounting-closings-summary"] });
                                    } catch (err: any) {
                                      toast.error(err.message || "Failed to remove from payout");
                                    }
                                  }}
                                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
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
          <CardTitle className="text-lg font-medium">Checks Ready to Go</CardTitle>
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
                     <TableHead>Property</TableHead>
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
                      <TableCell className="text-sm text-muted-foreground">{getPayoutProperties(payout.id)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(payout.total_amount))}</TableCell>
                      <TableCell>{payout.payout_date ? format(new Date(payout.payout_date + "T00:00:00"), "MMM d, yyyy") : format(new Date(), "MMM d, yyyy")}</TableCell>
                      <TableCell>{statusBadge(payout.status)}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handlePrintCheck(payout.id, payout.agent_name, Number(payout.total_amount))}>
                          <FileDown className="w-4 h-4 mr-1" /> {payout.status === "paid" ? "Re-print PDF" : "Print PDF"}
                        </Button>
                        {payout.status !== "paid" && (
                          <Button variant="ghost" size="sm" onClick={() => markPaid(payout.id)}>Mark Paid</Button>
                        )}
                        {payout.status !== "paid" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Payout</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the payout for {payout.agent_name} ({formatCurrency(Number(payout.total_amount))}). This cannot be undone.
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
