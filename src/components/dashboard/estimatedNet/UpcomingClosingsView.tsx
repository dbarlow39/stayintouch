import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Calendar, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/utils/estimatedNetCalculations";
import { format, parseISO, isValid, startOfMonth, addMonths } from "date-fns";
import { getEmailLink } from "@/utils/emailClientUtils";

const printStyles = `
@media print {
  @page {
    size: landscape;
    margin: 0.5in;
  }
  
  body * {
    visibility: hidden;
  }
  
  .print-area, .print-area * {
    visibility: visible;
  }
  
  .print-area {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
  }
  
  .no-print {
    display: none !important;
  }
  
  .print-area table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
  }
  
  .print-area th,
  .print-area td {
    border: 1px solid #ddd;
    padding: 4px 8px;
    text-align: left;
  }
  
  .print-area th {
    background-color: #f5f5f5 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .print-area .month-card {
    page-break-inside: avoid;
    margin-bottom: 20px;
  }
  
  .print-area .totals-row {
    background-color: #f9f9f9 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-weight: bold;
  }
  
  .print-area .grand-totals {
    margin-top: 20px;
    padding: 15px;
    border: 2px solid #333;
    page-break-inside: avoid;
  }
  
  .print-area h2 {
    font-size: 18pt;
    margin-bottom: 5px;
  }
  
  .print-area h3 {
    font-size: 14pt;
    margin-bottom: 10px;
  }
}
`;

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

  const handlePrint = () => {
    // Inject print styles
    const styleSheet = document.createElement("style");
    styleSheet.id = "print-styles";
    styleSheet.textContent = printStyles;
    document.head.appendChild(styleSheet);

    window.print();

    // Clean up styles after printing
    setTimeout(() => {
      const style = document.getElementById("print-styles");
      if (style) style.remove();
    }, 1000);
  };

  return (
    <div className="space-y-6 print-area">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="no-print">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">Upcoming Closings</h2>
            <p className="text-muted-foreground no-print">
              View all scheduled closings organized by month
            </p>
            <p className="hidden print:block text-sm text-muted-foreground">
              Generated on {format(new Date(), "MMMM d, yyyy")}
            </p>
          </div>
        </div>
        {closingsByMonth.length > 0 && (
          <Button onClick={handlePrint} className="no-print">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        )}
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
            <Card key={month} className="month-card">
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
                        <TableHead className="px-2">Closing Date</TableHead>
                        <TableHead className="px-2">Address</TableHead>
                        <TableHead className="px-2">Client Name</TableHead>
                        <TableHead className="px-2">Cell Phone</TableHead>
                        <TableHead className="px-2">Email</TableHead>
                        <TableHead className="px-2 text-right">Sales Price</TableHead>
                        <TableHead className="px-2 text-right">Commission</TableHead>
                        <TableHead className="px-2">Buyer's Agent</TableHead>
                        <TableHead className="px-2">Buyer's Agent Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthClosings.map((closing) => {
                        const parsedDate = parseClosingDate(closing.closing_date);
                        const commission = calculateCommission(closing.offer_price);

                        return (
                          <TableRow key={closing.id}>
                            <TableCell className="px-2 font-medium whitespace-nowrap">
                              {parsedDate ? format(parsedDate, "MMM d, yyyy") : closing.closing_date}
                            </TableCell>
                            <TableCell className="px-2 whitespace-nowrap">
                              {closing.street_address}
                            </TableCell>
                            <TableCell className="px-2 whitespace-nowrap">
                              {closing.name}
                            </TableCell>
                            <TableCell className="px-2 whitespace-nowrap">
                              {formatPhoneLink(closing.seller_phone)}
                            </TableCell>
                            <TableCell className="px-2 max-w-[150px] truncate">
                              {formatEmailLink(closing.seller_email)}
                            </TableCell>
                            <TableCell className="px-2 text-right whitespace-nowrap">
                              {formatCurrency(closing.offer_price)}
                            </TableCell>
                            <TableCell className="px-2 text-right whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(commission)}
                            </TableCell>
                            <TableCell className="px-2 whitespace-nowrap">
                              {closing.agent_name || "—"}
                            </TableCell>
                            <TableCell className="px-2 whitespace-nowrap">
                              {formatPhoneLink(closing.agent_contact)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Month totals row */}
                      <TableRow className="bg-muted/50 font-semibold totals-row">
                        <TableCell colSpan={5} className="px-2 text-right">
                          Month Totals:
                        </TableCell>
                        <TableCell className="px-2 text-right">
                          {formatCurrency(
                            monthClosings.reduce((sum, c) => sum + c.offer_price, 0)
                          )}
                        </TableCell>
                        <TableCell className="px-2 text-right text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(
                            monthClosings.reduce(
                              (sum, c) => sum + calculateCommission(c.offer_price),
                              0
                            )
                          )}
                        </TableCell>
                        <TableCell colSpan={2} className="px-2" />
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Grand totals card */}
          <Card className="bg-primary/5 border-primary/20 grand-totals">
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
