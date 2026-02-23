import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface ClosedDealsPageProps {
  onBack: () => void;
  onNavigate: (view: string) => void;
}

const ClosedDealsPage = ({ onBack, onNavigate }: ClosedDealsPageProps) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: closings = [] } = useQuery({
    queryKey: ["closed-deals-paid"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closings")
        .select("*")
        .eq("paid", true)
        .order("closing_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return closings;
    const q = searchQuery.toLowerCase();
    return closings.filter(c =>
      c.property_address?.toLowerCase().includes(q) ||
      c.agent_name?.toLowerCase().includes(q)
    );
  }, [closings, searchQuery]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Closed Deals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {closings.length} deal{closings.length !== 1 ? "s" : ""} paid out
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-lg font-medium">Paid Closings</CardTitle>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search property or agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          {closings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No paid closings yet.
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
                    <TableHead className="text-right">Agent Share</TableHead>
                    <TableHead>Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((closing) => (
                    <TableRow
                      key={closing.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => onNavigate(`edit-closing:${closing.id}`)}
                    >
                      <TableCell>
                        {format(new Date(closing.closing_date + "T00:00:00"), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="font-medium">{closing.property_address}</TableCell>
                      <TableCell>{closing.agent_name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(closing.total_commission))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(closing.agent_share))}
                      </TableCell>
                      <TableCell>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
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

export default ClosedDealsPage;
