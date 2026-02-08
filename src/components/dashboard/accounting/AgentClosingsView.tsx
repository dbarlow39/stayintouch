import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";

interface AgentClosingsViewProps {
  agentName: string;
  onBack: () => void;
}

const AgentClosingsView = ({ agentName, onBack }: AgentClosingsViewProps) => {
  const yearStart = new Date().getFullYear() + "-01-01";

  const { data: closings = [], isLoading } = useQuery({
    queryKey: ["agent-closings-ytd", agentName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closings")
        .select("id, closing_date, property_address, agent_share, caliber_title_bonus, caliber_title_amount, paid")
        .eq("agent_name", agentName)
        .eq("paid", true)
        .gte("closing_date", yearStart)
        .order("closing_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  // Build rows with YTD running total
  let runningTotal = 0;
  const rows = closings.map((c) => {
    const commission = Number(c.agent_share) + (c.caliber_title_bonus ? Number(c.caliber_title_amount) : 0);
    runningTotal += commission;
    return { ...c, commission, ytd: runningTotal };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div>
          <h3 className="text-lg font-medium">{agentName} — {new Date().getFullYear()} Closings</h3>
          <p className="text-sm text-muted-foreground">{closings.length} closing{closings.length !== 1 ? "s" : ""} this year</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No closings found for {agentName} this year.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Property</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">YTD Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{format(new Date(row.closing_date + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">{row.property_address}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.commission)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(row.ytd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default AgentClosingsView;
