import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, Send, Eye, RefreshCw, Mail, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Minus, ChevronDown, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

const DEFAULT_EMAIL_TEMPLATE = `Generate a weekly seller market update email for a real estate client.

MARKET DATA:
- Week of: {week_of}
- Active homes on market: {active_homes}
- Active homes last week: {active_homes_last_week}
- Inventory change: {inventory_change}
- Market average Days on Market (DOM): {market_avg_dom}
- Price trend: {price_trend}
- Homes with price reductions: {price_reductions}

CLIENT LISTING INFORMATION:
- Client name: {first_name} {last_name}
- Property address: {property_address}

ZILLOW PERFORMANCE:
- Days on Zillow: {zillow_days}
- Total views: {zillow_views}
- Total saves: {zillow_saves}

CONVERSION METRICS TO INCLUDE:
Based on {views} views, the expected showings range is {expected_showings_min}-{expected_showings_max} and expected offers is {expected_offers}.

INSTRUCTIONS:
1. Subject Line: "Weekly Christmas Season Market Update – {property_address}"
2. Greeting: Address {first_name} by first name with a brief holiday-season acknowledgment
3. Columbus Market Snapshot: Present the market data with week-over-week comparison
4. What This Means for Sellers: Translate data into plain English, emphasize seasonal normalcy
5. Your Property Performance: Present days on market, views, and saves (do NOT mention Zillow by name)
6. How Views Convert to Showings and Offers: Use this exact framework:
   - Every 200 views → 2-4 showings
   - Every 7-8 showings → 1 offer
   - State: "We have generated {views} online views which means we should have between {expected_showings_min} and {expected_showings_max} in person showings and at least {expected_offers} offer at this point."
7. Weekly Outlook: Measured, data-driven expectations for next week
8. Closing: Sign as:
   Dave Barlow
   Sell for 1 Percent Realtors
   📞 614-778-6616
   🌐 www.Sellfor1Percent.com

TONE REQUIREMENTS:
- Conservative, calm, factual, and reassuring
- No hype, urgency, sales language, or speculation
- Use phrases like "holding steady", "within normal seasonal ranges", "buyer interest remains selective"
- NEVER use: "hot market", "act now", "urgent", "guaranteed", "perfect time"
- Keep it professional and supportive

LENGTH: 600-750 words

FORMAT: Return ONLY the email content (subject line on first line, then body). Do not include any JSON or markdown formatting.`;

interface MarketData {
  id?: string;
  week_of: string;
  active_homes: number;
  active_homes_last_week: number | null;
  inventory_change: number | null;
  market_avg_dom: number;
  price_trend: 'up' | 'down' | 'stable';
  price_reductions: number;
}

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  street_number: string | null;
  street_name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  zillow_link: string | null;
  status: string | null;
}

interface ZillowStats {
  views: number | null;
  saves: number | null;
  days: number | null;
}

interface GeneratedEmail {
  clientId: string;
  subject: string;
  body: string;
  zillowStats: ZillowStats;
}

const WeeklyUpdateTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [marketData, setMarketData] = useState<MarketData>({
    week_of: format(new Date(), 'yyyy-MM-dd'),
    active_homes: 0,
    active_homes_last_week: null,
    inventory_change: null,
    market_avg_dom: 0,
    price_trend: 'stable',
    price_reductions: 0,
  });
  
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [generatedEmails, setGeneratedEmails] = useState<Map<string, GeneratedEmail>>(new Map());
  const [previewEmail, setPreviewEmail] = useState<GeneratedEmail | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [fetchingZillow, setFetchingZillow] = useState<string | null>(null);
  const [emailTemplate, setEmailTemplate] = useState(DEFAULT_EMAIL_TEMPLATE);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);

  // Fetch previous week's market data for comparison
  const { data: previousMarketData } = useQuery({
    queryKey: ["previous-market-data", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weekly_market_data")
        .select("*")
        .eq("agent_id", user!.id)
        .order("week_of", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!user,
  });

  // Update active_homes_last_week when previous data is loaded
  useEffect(() => {
    if (previousMarketData) {
      setMarketData(prev => ({
        ...prev,
        active_homes_last_week: previousMarketData.active_homes,
      }));
    }
  }, [previousMarketData]);

  // Calculate inventory change when active_homes changes
  useEffect(() => {
    if (marketData.active_homes_last_week !== null) {
      setMarketData(prev => ({
        ...prev,
        inventory_change: prev.active_homes - (prev.active_homes_last_week || 0),
      }));
    }
  }, [marketData.active_homes, marketData.active_homes_last_week]);

  // Fetch active clients
  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["active-clients-for-email", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, street_number, street_name, city, state, zip, zillow_link, status")
        .eq("agent_id", user!.id)
        .ilike("status", "A")
        .order("street_name", { ascending: true });
      if (error) throw error;
      return data as Client[];
    },
    enabled: !!user,
  });

  // Save market data mutation
  const saveMarketDataMutation = useMutation({
    mutationFn: async (data: MarketData) => {
      const { error } = await supabase
        .from("weekly_market_data")
        .upsert({
          agent_id: user!.id,
          ...data,
        }, { onConflict: 'agent_id,week_of' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Market data saved" });
      queryClient.invalidateQueries({ queryKey: ["previous-market-data"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error saving market data", description: error.message, variant: "destructive" });
    },
  });

  const fetchZillowStats = async (client: Client): Promise<ZillowStats> => {
    if (!client.zillow_link) {
      return { views: null, saves: null, days: null };
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-zillow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ zillow_url: client.zillow_link }),
        }
      );

      if (!response.ok) throw new Error('Failed to fetch Zillow stats');
      const data = await response.json();
      return { views: data.views, saves: data.saves, days: data.days };
    } catch (error) {
      console.error('Error fetching Zillow stats:', error);
      return { views: null, saves: null, days: null };
    }
  };

  const generateEmailForClient = async (client: Client, zillowStats: ZillowStats) => {
    const { data: session } = await supabase.auth.getSession();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-weekly-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session?.session?.access_token}`,
        },
        body: JSON.stringify({
          market_data: marketData,
          client_data: {
            first_name: client.first_name || '',
            last_name: client.last_name || '',
            street_number: client.street_number || '',
            street_name: client.street_name || '',
            city: client.city || 'Columbus',
            state: client.state || 'OH',
            zip: client.zip || '',
            zillow_views: zillowStats.views,
            zillow_saves: zillowStats.saves,
            zillow_days: zillowStats.days,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate email');
    }

    return await response.json();
  };

  const handleGenerateEmails = async () => {
    if (selectedClients.size === 0) {
      toast({ title: "No clients selected", description: "Please select at least one client", variant: "destructive" });
      return;
    }

    if (marketData.active_homes === 0) {
      toast({ title: "Market data required", description: "Please enter this week's market data", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    const newGeneratedEmails = new Map<string, GeneratedEmail>();

    try {
      // Save market data first
      await saveMarketDataMutation.mutateAsync(marketData);

      for (const clientId of selectedClients) {
        const client = clients?.find(c => c.id === clientId);
        if (!client) continue;

        setFetchingZillow(clientId);

        // Fetch Zillow stats
        const zillowStats = await fetchZillowStats(client);

        // Generate email
        const emailData = await generateEmailForClient(client, zillowStats);

        newGeneratedEmails.set(clientId, {
          clientId,
          subject: emailData.subject,
          body: emailData.body,
          zillowStats,
        });
      }

      setGeneratedEmails(newGeneratedEmails);
      toast({ title: "Emails generated", description: `Generated ${newGeneratedEmails.size} emails` });
    } catch (error) {
      console.error('Error generating emails:', error);
      toast({ title: "Error generating emails", description: error instanceof Error ? error.message : 'Unknown error', variant: "destructive" });
    } finally {
      setIsGenerating(false);
      setFetchingZillow(null);
    }
  };

  const handleSendEmails = async () => {
    if (generatedEmails.size === 0) {
      toast({ title: "No emails to send", description: "Please generate emails first", variant: "destructive" });
      return;
    }

    setIsSending(true);
    let sentCount = 0;

    try {
      const { data: session } = await supabase.auth.getSession();

      for (const [clientId, email] of generatedEmails) {
        const client = clients?.find(c => c.id === clientId);
        if (!client?.email) continue;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-weekly-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${session?.session?.access_token}`,
            },
            body: JSON.stringify({
              client_id: clientId,
              client_email: client.email,
              subject: email.subject,
              body: email.body,
              zillow_views: email.zillowStats.views,
              zillow_saves: email.zillowStats.saves,
              zillow_days: email.zillowStats.days,
            }),
          }
        );

        if (response.ok) {
          sentCount++;
        } else {
          const error = await response.json();
          console.error('Error sending email to', client.email, error);
        }
      }

      toast({ title: "Emails sent", description: `Successfully sent ${sentCount} emails` });
      setGeneratedEmails(new Map());
      setSelectedClients(new Set());
    } catch (error) {
      console.error('Error sending emails:', error);
      toast({ title: "Error sending emails", description: error instanceof Error ? error.message : 'Unknown error', variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const toggleClient = (clientId: string) => {
    const newSelected = new Set(selectedClients);
    if (newSelected.has(clientId)) {
      newSelected.delete(clientId);
    } else {
      newSelected.add(clientId);
    }
    setSelectedClients(newSelected);
  };

  const toggleAllClients = () => {
    if (!clients) return;
    
    const clientsWithEmail = clients.filter(c => c.email);
    if (selectedClients.size === clientsWithEmail.length) {
      setSelectedClients(new Set());
    } else {
      setSelectedClients(new Set(clientsWithEmail.map(c => c.id)));
    }
  };

  const getPriceTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'down': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Weekly Market Update
          </h3>
          <p className="text-sm text-muted-foreground">
            Send personalized weekly updates to your active clients
          </p>
        </div>
      </div>

      {/* Market Data Form */}
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-base">This Week's Market Data</CardTitle>
          <CardDescription>Enter the Columbus metro market statistics for this week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="week_of">Week Of</Label>
              <Input
                id="week_of"
                type="date"
                value={marketData.week_of}
                onChange={(e) => setMarketData({ ...marketData, week_of: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active_homes">Active Homes</Label>
              <Input
                id="active_homes"
                type="number"
                value={marketData.active_homes || ''}
                onChange={(e) => setMarketData({ ...marketData, active_homes: parseInt(e.target.value) || 0 })}
                placeholder="e.g., 2500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market_avg_dom">Avg Days on Market</Label>
              <Input
                id="market_avg_dom"
                type="number"
                value={marketData.market_avg_dom || ''}
                onChange={(e) => setMarketData({ ...marketData, market_avg_dom: parseInt(e.target.value) || 0 })}
                placeholder="e.g., 45"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_trend">Price Trend</Label>
              <Select 
                value={marketData.price_trend} 
                onValueChange={(value: 'up' | 'down' | 'stable') => setMarketData({ ...marketData, price_trend: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="up">Up</SelectItem>
                  <SelectItem value="stable">Stable</SelectItem>
                  <SelectItem value="down">Down</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_reductions">Price Reductions</Label>
              <Input
                id="price_reductions"
                type="number"
                value={marketData.price_reductions || ''}
                onChange={(e) => setMarketData({ ...marketData, price_reductions: parseInt(e.target.value) || 0 })}
                placeholder="e.g., 150"
              />
            </div>
            {previousMarketData && (
              <div className="space-y-2">
                <Label>Last Week's Active</Label>
                <div className="h-10 px-3 py-2 border rounded-md bg-muted/50 text-muted-foreground flex items-center">
                  {previousMarketData.active_homes}
                </div>
              </div>
            )}
            {marketData.inventory_change !== null && (
              <div className="space-y-2">
                <Label>Inventory Change</Label>
                <div className={`h-10 px-3 py-2 border rounded-md flex items-center gap-2 ${
                  marketData.inventory_change > 0 ? 'text-green-600 bg-green-50' : 
                  marketData.inventory_change < 0 ? 'text-red-600 bg-red-50' : 
                  'text-muted-foreground bg-muted/50'
                }`}>
                  {marketData.inventory_change > 0 ? '+' : ''}{marketData.inventory_change}
                  {getPriceTrendIcon(marketData.inventory_change > 0 ? 'up' : marketData.inventory_change < 0 ? 'down' : 'stable')}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Template Editor */}
      <Collapsible open={isTemplateOpen} onOpenChange={setIsTemplateOpen}>
        <Card className="shadow-soft">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Email Template</CardTitle>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isTemplateOpen ? 'rotate-180' : ''}`} />
              </div>
              <CardDescription>View and edit the AI prompt used to generate emails</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <Textarea
                  value={emailTemplate}
                  onChange={(e) => setEmailTemplate(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Email template prompt..."
                />
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setEmailTemplate(DEFAULT_EMAIL_TEMPLATE)}
                  >
                    Reset to Default
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Variables like {"{first_name}"}, {"{property_address}"} will be replaced with actual values
                  </p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Client Selection */}
      <Card className="shadow-soft">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Select Clients</CardTitle>
              <CardDescription>
                Choose which active clients to send the weekly update
                {clients && ` (${clients.filter(c => c.email).length} with email)`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleAllClients}>
                {selectedClients.size === clients?.filter(c => c.email).length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingClients ? (
            <div className="text-center py-8 text-muted-foreground">Loading clients...</div>
          ) : !clients || clients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active clients found
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Zillow</TableHead>
                    {generatedEmails.size > 0 && <TableHead>Status</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const hasEmail = !!client.email;
                    const email = generatedEmails.get(client.id);
                    
                    return (
                      <TableRow key={client.id} className={!hasEmail ? 'opacity-50' : ''}>
                        <TableCell>
                          <Checkbox
                            checked={selectedClients.has(client.id)}
                            onCheckedChange={() => toggleClient(client.id)}
                            disabled={!hasEmail}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {client.first_name} {client.last_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {client.street_number} {client.street_name}
                        </TableCell>
                        <TableCell>
                          {hasEmail ? (
                            <span className="text-sm">{client.email}</span>
                          ) : (
                            <Badge variant="outline" className="text-destructive border-destructive/50">
                              No email
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {client.zillow_link ? (
                            <Badge variant="outline" className="text-green-600 border-green-600/50">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Linked
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              No link
                            </Badge>
                          )}
                        </TableCell>
                        {generatedEmails.size > 0 && (
                          <TableCell>
                            {email ? (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setPreviewEmail(email)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Preview
                              </Button>
                            ) : fetchingZillow === client.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : null}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-4">
        <div className="text-sm text-muted-foreground">
          {selectedClients.size} client{selectedClients.size !== 1 ? 's' : ''} selected
        </div>
        <Button
          variant="outline"
          onClick={handleGenerateEmails}
          disabled={isGenerating || selectedClients.size === 0}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Mail className="w-4 h-4 mr-2" />
              Generate Emails
            </>
          )}
        </Button>
        <Button
          onClick={handleSendEmails}
          disabled={isSending || generatedEmails.size === 0}
        >
          {isSending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send {generatedEmails.size > 0 ? `(${generatedEmails.size})` : ''}
            </>
          )}
        </Button>
      </div>

      {/* Email Preview Dialog */}
      <Dialog open={!!previewEmail} onOpenChange={() => setPreviewEmail(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          {previewEmail && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Subject</Label>
                <div className="p-3 bg-muted rounded-md font-medium">
                  {previewEmail.subject}
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="px-3 py-1 bg-primary/10 rounded-full">
                  Views: {previewEmail.zillowStats.views ?? 'N/A'}
                </div>
                <div className="px-3 py-1 bg-primary/10 rounded-full">
                  Saves: {previewEmail.zillowStats.saves ?? 'N/A'}
                </div>
                <div className="px-3 py-1 bg-primary/10 rounded-full">
                  Days: {previewEmail.zillowStats.days ?? 'N/A'}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Body</Label>
                <ScrollArea className="h-[400px] border rounded-md p-4">
                  <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                    {previewEmail.body}
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WeeklyUpdateTab;
