import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, FileCheck, Clock, Users, CheckCircle2, XCircle } from "lucide-react";
import ReadyToPayDialog from "./ReadyToPayDialog";
import { format } from "date-fns";

interface AccountingDashboardProps {
  onNavigate: (view: string) => void;
}

const AccountingDashboard = ({ onNavigate }: AccountingDashboardProps) => {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [readyToPayOpen, setReadyToPayOpen] = useState(false);

  const { data: closings = [] } = useQuery({
    queryKey: ["accounting-closings-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closings")
        .select("*")
        .order("closing_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const hasCheckReceived = (closing: typeof closings[0]) =>
    closing.status === "received" ||
    closing.status === "check_received" ||
    (closing.notes?.toLowerCase().includes("check received") ?? false);

  const hasPaperworkReceived = (closing: typeof closings[0]) =>
    closing.paperwork_status === "received" ||
    (closing.notes?.toLowerCase().includes("paperwork complete") ?? false);

  const { data: pendingChecks = [] } = useQuery({
    queryKey: ["accounting-pending-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closing_checks")
        .select("*, closings(property_address, agent_name)")
        .eq("deposited", false)
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const { data: pendingPayouts = [] } = useQuery({
    queryKey: ["accounting-pending-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("*")
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const pendingClosings = closings.filter(c => c.status === "pending" || c.status === "check_received");
  const totalPendingCommission = pendingPayouts.reduce((sum, p) => sum + Number(p.total_amount), 0);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: "bg-amber-100 text-amber-800",
      check_received: "bg-blue-100 text-blue-800",
      processed: "bg-emerald-100 text-emerald-800",
      paid: "bg-green-100 text-green-800",
    };
    return (
      <Badge className={`${variants[status] || "bg-muted text-muted-foreground"} border-0`}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const unpaidClosings = closings.filter(c => !c.paid);
  const selectedClosings = closings.filter(c => selectedIds.includes(c.id));

  const handleReadyToPay = () => {
    if (selectedIds.length === 0) return;
    setReadyToPayOpen(true);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Commission Central</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage Your Agents Commissions</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-0 shadow-sm bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Closings</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{pendingClosings.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting processing</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Undeposited Checks</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{pendingChecks.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Need deposit confirmation</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payouts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{pendingPayouts.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Agents awaiting payment</p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pending</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground/60" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tracking-tight">{formatCurrency(totalPendingCommission)}</div>
            <p className="text-xs text-muted-foreground mt-1">Commission to distribute</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onNavigate("add-closing")} variant="outline">
          Add Closing
        </Button>
        <Button onClick={() => onNavigate("commission-prep")} variant="outline">
          Commission Prep
        </Button>
        <Button onClick={() => onNavigate("1099-export")} variant="outline">
          1099 Export
        </Button>
        <Button onClick={() => onNavigate("agents")} variant="outline">
          <Users className="h-4 w-4 mr-2" />
          Agent(s)
        </Button>
      </div>

      {/* Recent Closings */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium">Recent Closings</CardTitle>
          {selectedIds.length > 0 && (
            <Button
              onClick={handleReadyToPay}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
              size="sm"
            >
              Ready to Pay ({selectedIds.length})
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {closings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No closings yet. Add your first closing to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Closing Date</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead>Check</TableHead>
                    <TableHead>Paperwork</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead className="w-10">Ready to Pay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closings.map((closing) => (
                    <TableRow key={closing.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {format(new Date(closing.closing_date + "T00:00:00"), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium" onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {closing.property_address}
                      </TableCell>
                      <TableCell onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {closing.agent_name}
                      </TableCell>
                      <TableCell className="text-right" onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {formatCurrency(Number(closing.total_commission))}
                      </TableCell>
                      <TableCell onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {hasCheckReceived(closing)
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                      </TableCell>
                      <TableCell onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {hasPaperworkReceived(closing)
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : <XCircle className="h-4 w-4 text-muted-foreground/40" />}
                      </TableCell>
                      <TableCell onClick={() => onNavigate(`edit-closing:${closing.id}`)}>
                        {closing.paid
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          : null}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {!closing.paid && hasCheckReceived(closing) && hasPaperworkReceived(closing) ? (
                          <Checkbox
                            checked={selectedIds.includes(closing.id)}
                            onCheckedChange={() => toggleSelect(closing.id)}
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReadyToPayDialog
        open={readyToPayOpen}
        onOpenChange={(open) => {
          setReadyToPayOpen(open);
          if (!open) setSelectedIds([]);
        }}
        closings={selectedClosings}
        onNavigate={onNavigate}
      />
    </div>
  );
};

export default AccountingDashboard;
