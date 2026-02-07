import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface TaxSummaryExportProps {
  onBack: () => void;
}

const TaxSummaryExport = ({ onBack }: TaxSummaryExportProps) => {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedAgent, setSelectedAgent] = useState("all");

  const { data: payouts = [] } = useQuery({
    queryKey: ["accounting-1099-payouts", selectedYear],
    queryFn: async () => {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("*")
        .eq("status", "paid")
        .gte("payout_date", startDate)
        .lte("payout_date", endDate)
        .order("agent_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Aggregate by agent
  const agentSummary = payouts.reduce<Record<string, { name: string; total: number; count: number }>>((acc, p) => {
    const key = p.agent_name;
    if (!acc[key]) acc[key] = { name: key, total: 0, count: 0 };
    acc[key].total += Number(p.total_amount);
    acc[key].count += 1;
    return acc;
  }, {});

  const agents = Object.values(agentSummary);
  const filteredAgents = selectedAgent === "all" ? agents : agents.filter(a => a.name === selectedAgent);
  const grandTotal = filteredAgents.reduce((sum, a) => sum + a.total, 0);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
  const uniqueAgentNames = [...new Set(payouts.map(p => p.agent_name))];

  const exportCsv = () => {
    const rows = filteredAgents.map(a => `"${a.name}",${a.count},${a.total.toFixed(2)}`);
    const csv = `Agent Name,Number of Checks,Total Paid\n${rows.join("\n")}\n\nGrand Total,,${grandTotal.toFixed(2)}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `1099-summary-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully.");
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Button>

      <div>
        <h2 className="text-xl font-medium">1099 Summary & Export</h2>
        <p className="text-sm text-muted-foreground">Review agent payouts for tax reporting</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Year</label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Agent</label>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {uniqueAgentNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button variant="outline" onClick={exportCsv} disabled={filteredAgents.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-medium flex items-center gap-2">
            <FileText className="w-5 h-5" /> {selectedYear} Payout Summary
          </CardTitle>
          <CardDescription>Paid commissions by agent for the selected year</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredAgents.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">No paid commissions found for {selectedYear}.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent Name</TableHead>
                    <TableHead className="text-center">Checks Issued</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgents.map(agent => (
                    <TableRow key={agent.name}>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-center">{agent.count}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(agent.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>Grand Total</TableCell>
                    <TableCell className="text-center">{filteredAgents.reduce((s, a) => s + a.count, 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(grandTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TaxSummaryExport;
