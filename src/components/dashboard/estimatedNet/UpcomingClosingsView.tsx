import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/utils/estimatedNetCalculations";
import { format, parseISO, isValid, startOfMonth, addMonths } from "date-fns";
import { getEmailLink } from "@/utils/emailClientUtils";

interface UpcomingClosingsViewProps {
  onBack: () => void;
}

interface ClosingData {
  id: string;
  street_address: string;
  city: string;
  state: string;
  closing_date: string | null;
  in_contract: string | null;
  offer_price: number;
  name: string; // Client name
  seller_phone: string | null;
  seller_email: string | null;
  agent_name: string | null; // Buyer's agent name
  agent_contact: string | null; // Buyer's agent phone
}

// Commission calculation: sales price * 1% + $499
const calculateCommission = (salePrice: number): number => {
  return salePrice * 0.01 + 499;
};

// Parse a closing date string (handles various formats)
const parseClosingDate = (dateStr: string | null): Date | null => {
  if (!dateStr) return null;
  
  // Try ISO format first
  let parsed = parseISO(dateStr);
  if (isValid(parsed)) return parsed;
  
  // Try parsing common text formats like "March 10, 2025"
  try {
    const date = new Date(dateStr);
    if (isValid(date)) return date;
  } catch {
    return null;
  }
  
  return null;
};

const UpcomingClosingsView = ({ onBack }: UpcomingClosingsViewProps) => {
  const { user } = useAuth();

  // Fetch all properties with closing dates
  const { data: closings = [], isLoading } = useQuery({
    queryKey: ["upcoming-closings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimated_net_properties")
        .select(`
          id,
          street_address,
          city,
          state,
          closing_date,
          in_contract,
          offer_price,
          name,
          seller_phone,
          seller_email,
          agent_name,
          agent_contact
        `)
        .eq("agent_id", user!.id)
        .not("closing_date", "is", null)
        .not("in_contract", "is", null);

      if (error) throw error;
      return data as ClosingData[];
    },
    enabled: !!user,
  });

  // Group closings by month
  const closingsByMonth = useMemo(() => {
    const now = new Date();
    const grouped: Map<string, ClosingData[]> = new Map();

    // Filter to future closings and sort by date
    const futureClosings = closings
      .map((closing) => ({
        ...closing,
        parsedDate: parseClosingDate(closing.closing_date),
      }))
      .filter((c) => c.parsedDate && c.parsedDate >= startOfMonth(now))
      .sort((a, b) => (a.parsedDate!.getTime() - b.parsedDate!.getTime()));

    // Generate next 12 months as keys
    for (let i = 0; i < 12; i++) {
      const monthDate = addMonths(startOfMonth(now), i);
      const monthKey = format(monthDate, "MMMM yyyy");
      grouped.set(monthKey, []);
    }

    // Group closings into months
    futureClosings.forEach((closing) => {
      const monthKey = format(closing.parsedDate!, "MMMM yyyy");
      if (grouped.has(monthKey)) {
        grouped.get(monthKey)!.push(closing);
      }
    });

    // Return only months with closings
    return Array.from(grouped.entries()).filter(([, items]) => items.length > 0);
  }, [closings]);

  const formatPhoneLink = (phone: string | null) => {
    if (!phone) return "—";
    const digits = phone.replace(/\D/g, "");
    return (
      <a href={`tel:${digits}`} className="text-primary hover:underline">
        {phone}
      </a>
    );
  };

  const formatEmailLink = (email: string | null) => {
    if (!email) return "—";
    return (
      <a 
        href={getEmailLink(email)} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        {email}
      </a>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold">Upcoming Closings</h2>
          <p className="text-muted-foreground">
            View all scheduled closings organized by month
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : closingsByMonth.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No upcoming closings</h3>
            <p className="text-muted-foreground text-center">
              Properties with closing dates in the future will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {closingsByMonth.map(([month, monthClosings]) => (
            <Card key={month}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {month}
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    ({monthClosings.length} closing{monthClosings.length !== 1 ? "s" : ""})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Closing Date</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Client Name</TableHead>
                        <TableHead>Cell Phone</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Sales Price</TableHead>
                        <TableHead className="text-right">Commission</TableHead>
                        <TableHead>Buyer's Agent</TableHead>
                        <TableHead>Buyer's Agent Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthClosings.map((closing) => {
                        const parsedDate = parseClosingDate(closing.closing_date);
                        const commission = calculateCommission(closing.offer_price);

                        return (
                          <TableRow key={closing.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {parsedDate ? format(parsedDate, "MMM d, yyyy") : closing.closing_date}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {closing.street_address}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {closing.name}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatPhoneLink(closing.seller_phone)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatEmailLink(closing.seller_email)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {formatCurrency(closing.offer_price)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(commission)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {closing.agent_name || "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {formatPhoneLink(closing.agent_contact)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Month totals row */}
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={5} className="text-right">
                          Month Totals:
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            monthClosings.reduce((sum, c) => sum + c.offer_price, 0)
                          )}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(
                            monthClosings.reduce(
                              (sum, c) => sum + calculateCommission(c.offer_price),
                              0
                            )
                          )}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Grand totals card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Closings</p>
                  <p className="text-2xl font-bold">
                    {closingsByMonth.reduce((sum, [, items]) => sum + items.length, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Sales Volume</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      closingsByMonth.reduce(
                        (sum, [, items]) =>
                          sum + items.reduce((s, c) => s + c.offer_price, 0),
                        0
                      )
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Commission</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(
                      closingsByMonth.reduce(
                        (sum, [, items]) =>
                          sum + items.reduce((s, c) => s + calculateCommission(c.offer_price), 0),
                        0
                      )
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default UpcomingClosingsView;
