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
import { Calendar, Send, Eye, RefreshCw, Mail, CheckCircle, AlertCircle, TrendingUp, TrendingDown, Minus, ChevronDown, FileText, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { format } from "date-fns";

const generateSampleEmail = (
  client: { first_name: string | null; last_name: string | null; street_number: string | null; street_name: string | null; city: string | null; state: string | null; zip: string | null } | null,
  marketData?: { week_of: string; active_homes: number; active_homes_last_week: number | null; inventory_change: number | null; market_avg_dom: number; price_trend: string; price_reductions: number; mortgage_rate_30yr?: number; mortgage_rate_30yr_week_ago?: number; mortgage_rate_30yr_year_ago?: number; mortgage_rate_15yr?: number; mortgage_rate_15yr_week_ago?: number; mortgage_rate_15yr_year_ago?: number; freddie_mac_summary?: string }
) => {
  // Use placeholders that will be replaced by the edge function for each client
  const weekOf = marketData?.week_of ? format(new Date(marketData.week_of), 'MMMM d, yyyy') : format(new Date(), 'MMMM d, yyyy');
  const activeHomes = marketData?.active_homes || 2450;
  const activeHomesLastWeek = marketData?.active_homes_last_week || 2425;
  const inventoryChange = marketData?.inventory_change ?? (activeHomes - activeHomesLastWeek);
  const avgDom = marketData?.market_avg_dom || 42;
  const priceTrend = marketData?.price_trend || 'stable';
  const priceReductions = marketData?.price_reductions || 0;
  const mortgageRate30yr = marketData?.mortgage_rate_30yr || 6.85;
  const mortgageRate30yrWeekAgo = marketData?.mortgage_rate_30yr_week_ago || 6.81;
  const mortgageRate30yrYearAgo = marketData?.mortgage_rate_30yr_year_ago || 6.67;
  const mortgageRate15yr = marketData?.mortgage_rate_15yr || 6.10;
  const mortgageRate15yrWeekAgo = marketData?.mortgage_rate_15yr_week_ago || 6.05;
  const mortgageRate15yrYearAgo = marketData?.mortgage_rate_15yr_year_ago || 5.95;
  const freddieMacSummary = marketData?.freddie_mac_summary || 'Mortgage rates remain elevated as the Federal Reserve continues to monitor inflation. Buyers are adjusting to the current rate environment, and those who are actively searching remain motivated.';
  
  const inventoryChangeText = inventoryChange > 0 
    ? `a modest increase of ${inventoryChange} listings` 
    : inventoryChange < 0 
    ? `a decrease of ${Math.abs(inventoryChange)} listings` 
    : 'no change in listings';

  // Template uses placeholders like {first_name}, {property_address}, etc.
  // These get replaced by the edge function for EACH client when sending
  // Generate market synopsis based on conditions
  const getMarketSynopsis = () => {
    const inventoryTrend = inventoryChange > 10 ? 'increasing' : inventoryChange < -10 ? 'tightening' : 'steady';
    const domContext = avgDom < 30 ? 'brisk' : avgDom < 60 ? 'moderate' : 'slower';
    const priceContext = priceTrend === 'increasing' ? 'upward pressure on prices' : priceTrend === 'decreasing' ? 'softening prices' : 'stable pricing';
    
    return `The Columbus real estate market is showing ${inventoryTrend} inventory levels with ${domContext} buyer activity and ${priceContext}. With ${activeHomes.toLocaleString()} active listings and an average of ${avgDom} days on market, conditions continue to favor ${avgDom < 45 ? 'sellers' : avgDom > 60 ? 'buyers' : 'a balanced market'}. Current mortgage rates around ${mortgageRate30yr}% are influencing buyer behavior, though serious buyers remain active in the market.`;
  };

  return `Subject: Weekly Market Update – {property_address}

Dear {first_name},

${getMarketSynopsis()}

As your listing agent, I wanted to provide you with this week's detailed market update and share how your property at {street_number} {street_name} is performing.

📊 Columbus Market Snapshot – Week of ${weekOf}

This week, the Columbus metro area has ${activeHomes.toLocaleString()} active homes on the market, compared to ${activeHomesLastWeek.toLocaleString()} last week—${inventoryChangeText}. The market average days on market currently stands at ${avgDom} days, and pricing trends remain ${priceTrend}. Approximately ${priceReductions} homes have undergone price reductions this week.

🏦 Freddie Mac Mortgage Rates

According to Freddie Mac's Primary Mortgage Market Survey:

30-Year Fixed Rate:
- This Week: ${mortgageRate30yr}%
- Last Week: ${mortgageRate30yrWeekAgo}%
- One Year Ago: ${mortgageRate30yrYearAgo}%

15-Year Fixed Rate:
- This Week: ${mortgageRate15yr}%
- Last Week: ${mortgageRate15yrWeekAgo}%
- One Year Ago: ${mortgageRate15yrYearAgo}%

📰 What Freddie Mac Says

${freddieMacSummary}

💡 What This Means for Sellers

These numbers reflect typical seasonal patterns. Buyer activity remains selective, and inventory levels are holding steady within normal ranges.

🏠 Your Property Performance

Your home at {street_number} {street_name} has been on the market for {zillow_days} days. During this time, we have generated significant online interest:

- Total online views: {zillow_views}
- Total saves by interested buyers: {zillow_saves}

These engagement numbers indicate solid buyer interest in your property.

📈 How Views Convert to Showings and Offers

Based on industry data, here is how online engagement typically translates to in-person activity:

- Every 200 views → 2-4 showings
- Every 7-8 showings → 1 offer

We have generated {zillow_views} online views which means we should have between {expected_showings_min} and {expected_showings_max} in person showings and at least {expected_offers} offers at this point.

🔮 Weekly Outlook

We anticipate buyer activity to remain measured. Serious buyers who are actively searching tend to be highly motivated. We will continue monitoring showing requests and feedback closely.

Please do not hesitate to reach out if you have any questions or would like to discuss your listing strategy.

Warm regards,

Dave Barlow
Sell for 1 Percent Realtors
📞 614-778-6616
🌐 www.Sellfor1Percent.com`;
};

interface MarketData {
  id?: string;
  week_of: string;
  active_homes: number;
  active_homes_last_week: number | null;
  inventory_change: number | null;
  market_avg_dom: number;
  price_trend: 'up' | 'down' | 'stable';
  price_reductions: number;
  mortgage_rate_30yr?: number;
  mortgage_rate_30yr_week_ago?: number;
  mortgage_rate_30yr_year_ago?: number;
  mortgage_rate_15yr?: number;
  mortgage_rate_15yr_week_ago?: number;
  mortgage_rate_15yr_year_ago?: number;
  freddie_mac_summary?: string;
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
    mortgage_rate_30yr: undefined,
    mortgage_rate_30yr_week_ago: undefined,
    mortgage_rate_30yr_year_ago: undefined,
    mortgage_rate_15yr: undefined,
    mortgage_rate_15yr_week_ago: undefined,
    mortgage_rate_15yr_year_ago: undefined,
    freddie_mac_summary: undefined,
  });
  
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [generatedEmails, setGeneratedEmails] = useState<Map<string, GeneratedEmail>>(new Map());
  const [previewEmail, setPreviewEmail] = useState<GeneratedEmail | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [fetchingZillow, setFetchingZillow] = useState<string | null>(null);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [templateInitialized, setTemplateInitialized] = useState(false);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [isFetchingFreddieMac, setIsFetchingFreddieMac] = useState(false);
  const [freddieMacFetched, setFreddieMacFetched] = useState(false);

  const MASTER_USER_ID = '579941cc-bf37-4a75-8030-450e06c49f44';
  const isMasterUser = user?.id === MASTER_USER_ID;

  // Fetch agent profile for preferred email and saved template
  const { data: agentProfile, isLoading: loadingAgentProfile } = useQuery({
    queryKey: ["agent-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, cell_phone, preferred_email, website, bio, email_template")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch master template
  const { data: masterTemplate, isLoading: loadingMasterTemplate } = useQuery({
    queryKey: ["master-email-template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("master_email_templates")
        .select("template")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.template ?? null;
    },
    enabled: !!user,
  });

  // Load saved email template: master users always load master template; others load personal or fallback to master
  useEffect(() => {
    if (templateInitialized) return;
    if (loadingAgentProfile || loadingMasterTemplate) return;

    if (isMasterUser) {
      // Master user always uses the master template
      if (masterTemplate) {
        setEmailTemplate(masterTemplate);
      } else {
        setEmailTemplate(generateSampleEmail(null, marketData));
      }
    } else {
      // Regular user: personal template first, then master, then default
      if (agentProfile?.email_template) {
        setEmailTemplate(agentProfile.email_template);
      } else if (masterTemplate) {
        setEmailTemplate(masterTemplate);
      } else {
        setEmailTemplate(generateSampleEmail(null, marketData));
      }
    }

    setTemplateDirty(false);
    setTemplateInitialized(true);
  }, [
    agentProfile,
    isMasterUser,
    loadingAgentProfile,
    loadingMasterTemplate,
    marketData,
    masterTemplate,
    templateInitialized,
  ]);

  // Save email template to database
  const saveEmailTemplate = useMutation({
    mutationFn: async (template: string) => {
      if (isMasterUser) {
        // Master user: update master template and clear all user templates
        // First, upsert master template (delete existing, insert new)
        const { error: deleteError } = await supabase
          .from("master_email_templates")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all
        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
          .from("master_email_templates")
          .insert({ template, updated_by: user!.id });
        if (insertError) throw insertError;

        // Clear all user templates
        const { error: clearError } = await supabase.rpc("clear_user_templates");
        if (clearError) throw clearError;
      } else {
        // Regular user: save to their own profile only
        const { error } = await supabase
          .from("profiles")
          .update({ email_template: template })
          .eq("id", user!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setTemplateDirty(false);
      queryClient.invalidateQueries({ queryKey: ["agent-profile", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["master-email-template"] });
    },
    onError: (error: Error) => {
      toast({ title: "Template save failed", description: error.message, variant: "destructive" });
    },
  });

  // Auto-save template when it changes (debounced)
  useEffect(() => {
    if (!templateInitialized || !emailTemplate || !templateDirty) return;

    const timeoutId = setTimeout(() => {
      saveEmailTemplate.mutate(emailTemplate);
    }, 2000); // Save after 2 seconds of no typing

    return () => clearTimeout(timeoutId);
  }, [emailTemplate, templateDirty, templateInitialized]);

  // Fetch most recent market data to pre-populate form
  // Non-master users load master user's data as default, master user loads their own
  const { data: savedMarketData } = useQuery({
    queryKey: ["saved-market-data", isMasterUser ? user?.id : MASTER_USER_ID],
    queryFn: async () => {
      // First try to get the agent's own data (for master user, or for non-master who has customized)
      if (isMasterUser) {
        const { data, error } = await supabase
          .from("weekly_market_data")
          .select("*")
          .eq("agent_id", user!.id)
          .order("week_of", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      
      // Non-master users: first check if they have their own data for this week
      const { data: ownData, error: ownError } = await supabase
        .from("weekly_market_data")
        .select("*")
        .eq("agent_id", user!.id)
        .order("week_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ownError) throw ownError;
      
      // If they have their own data, use it
      if (ownData) {
        return ownData;
      }
      
      // Otherwise, load master user's data as default
      const { data: masterData, error: masterError } = await supabase
        .from("weekly_market_data")
        .select("*")
        .eq("agent_id", MASTER_USER_ID)
        .order("week_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (masterError) throw masterError;
      
      // Return master data but without the id so it creates a new record when saved
      if (masterData) {
        return { ...masterData, id: undefined, agent_id: user!.id };
      }
      
      return null;
    },
    enabled: !!user,
  });

  // Load saved market data into form when available
  useEffect(() => {
    if (savedMarketData) {
      // Merge to avoid wiping Freddie Mac / mortgage fields that are held in local state
      // Always recalculate inventory_change from active_homes and active_homes_last_week
      const calculatedInventoryChange = savedMarketData.active_homes_last_week !== null 
        ? savedMarketData.active_homes - savedMarketData.active_homes_last_week 
        : null;
      
      setMarketData((prev) => ({
        ...prev,
        id: savedMarketData.id,
        week_of: savedMarketData.week_of,
        active_homes: savedMarketData.active_homes,
        active_homes_last_week: savedMarketData.active_homes_last_week,
        inventory_change: calculatedInventoryChange,
        market_avg_dom: savedMarketData.market_avg_dom,
        price_trend: savedMarketData.price_trend as 'up' | 'down' | 'stable',
        price_reductions: savedMarketData.price_reductions || 0,
      }));
    }
  }, [savedMarketData]);

  // Auto-fetch Freddie Mac summary on component mount
  useEffect(() => {
    if (freddieMacFetched || isFetchingFreddieMac) return;

    const fetchFreddieMac = async () => {
      setIsFetchingFreddieMac(true);
      try {
        const { data, error } = await supabase.functions.invoke('fetch-freddie-mac');
        if (error) throw error;

        const rates = data?.rates;
        if (data?.summary || rates) {
          setMarketData((prev) => ({
            ...prev,
            freddie_mac_summary: data?.summary ?? prev.freddie_mac_summary,
            mortgage_rate_30yr: rates?.mortgage_rate_30yr ?? prev.mortgage_rate_30yr,
            mortgage_rate_30yr_week_ago: rates?.mortgage_rate_30yr_week_ago ?? prev.mortgage_rate_30yr_week_ago,
            mortgage_rate_30yr_year_ago: rates?.mortgage_rate_30yr_year_ago ?? prev.mortgage_rate_30yr_year_ago,
            mortgage_rate_15yr: rates?.mortgage_rate_15yr ?? prev.mortgage_rate_15yr,
            mortgage_rate_15yr_week_ago: rates?.mortgage_rate_15yr_week_ago ?? prev.mortgage_rate_15yr_week_ago,
            mortgage_rate_15yr_year_ago: rates?.mortgage_rate_15yr_year_ago ?? prev.mortgage_rate_15yr_year_ago,
          }));
        }
      } catch (err) {
        console.error('Error fetching Freddie Mac:', err);
      } finally {
        setIsFetchingFreddieMac(false);
        setFreddieMacFetched(true);
      }
    };

    fetchFreddieMac();
  }, [freddieMacFetched, isFetchingFreddieMac]);

  // Save market data mutation
  const saveMarketData = useMutation({
    mutationFn: async (data: MarketData) => {
      if (data.id) {
        // Update existing record
        const { error } = await supabase
          .from("weekly_market_data")
          .update({
            week_of: data.week_of,
            active_homes: data.active_homes,
            active_homes_last_week: data.active_homes_last_week,
            inventory_change: data.inventory_change,
            market_avg_dom: data.market_avg_dom,
            price_trend: data.price_trend,
            price_reductions: data.price_reductions,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from("weekly_market_data")
          .insert({
            agent_id: user!.id,
            week_of: data.week_of,
            active_homes: data.active_homes,
            active_homes_last_week: data.active_homes_last_week,
            inventory_change: data.inventory_change,
            market_avg_dom: data.market_avg_dom,
            price_trend: data.price_trend,
            price_reductions: data.price_reductions,
          });
        if (error) throw error;
      }
    },
    onError: (error) => {
      toast({ title: "Error saving market data", description: error.message, variant: "destructive" });
    },
  });

  // Auto-save market data when it changes (debounced)
  const [hasUserEdited, setHasUserEdited] = useState(false);
  
  useEffect(() => {
    if (!hasUserEdited || !user) return;
    
    const timer = setTimeout(() => {
      if (marketData.active_homes > 0 && marketData.market_avg_dom > 0) {
        saveMarketData.mutate(marketData);
      }
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [marketData.week_of, marketData.active_homes, marketData.active_homes_last_week, marketData.market_avg_dom, marketData.price_trend, marketData.price_reductions, hasUserEdited]);

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
          template: emailTemplate,
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

  const handleSendEmails = async () => {
    if (selectedClients.size === 0) {
      toast({ title: "No clients selected", description: "Please select at least one client", variant: "destructive" });
      return;
    }

    if (marketData.active_homes === 0) {
      toast({ title: "Market data required", description: "Please enter this week's market data", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setIsSending(true);
    let sentCount = 0;

    try {
      // Save market data first
      await saveMarketDataMutation.mutateAsync(marketData);

      const { data: session } = await supabase.auth.getSession();

      for (const clientId of selectedClients) {
        const client = clients?.find(c => c.id === clientId);
        if (!client?.email) continue;

        setFetchingZillow(clientId);

        // Fetch Zillow stats
        const zillowStats = await fetchZillowStats(client);

        // Generate email
        const emailData = await generateEmailForClient(client, zillowStats);

        // Send email immediately
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
              subject: emailData.subject,
              body: emailData.body,
              zillow_views: zillowStats.views,
              zillow_saves: zillowStats.saves,
              zillow_days: zillowStats.days,
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
      setIsGenerating(false);
      setIsSending(false);
      setFetchingZillow(null);
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

  const handleSendTestEmail = async () => {
    const testEmail = agentProfile?.preferred_email || user?.email;
    
    if (!testEmail) {
      toast({ title: "No email found", description: "Please set your preferred email in Account settings", variant: "destructive" });
      return;
    }

    setIsSendingTest(true);

    try {
      // Use agent's own name for test email so they see what their clients would receive
      const agentFirstName = agentProfile?.first_name || 'Test';
      const agentLastName = agentProfile?.last_name || 'Agent';

      // Generate a test email using the template with agent's own name and sample data
      const response = await supabase.functions.invoke('generate-weekly-email', {
        body: {
          template: emailTemplate,
          marketData: {
            week_of: marketData.week_of,
            active_homes: marketData.active_homes,
            active_homes_last_week: marketData.active_homes_last_week,
            inventory_change: marketData.inventory_change,
            market_avg_dom: marketData.market_avg_dom,
            price_trend: marketData.price_trend,
            price_reductions: marketData.price_reductions,
          },
          clientData: {
            first_name: agentFirstName,
            last_name: agentLastName,
            street_number: '123',
            street_name: 'Sample Street',
            city: 'Columbus',
            state: 'OH',
            zip: '43215',
            zillow_views: 1250,
            zillow_saves: 45,
            zillow_days: 28,
          },
        },
      });

      if (response.error) throw response.error;

      const emailData = response.data;

      // Send the test email to preferred email
      const sendResponse = await supabase.functions.invoke('send-weekly-email', {
        body: {
          to: testEmail,
          subject: `[TEST] ${emailData.subject}`,
          body: emailData.body,
        },
      });

      if (sendResponse.error) throw sendResponse.error;

      toast({ title: "Test email sent", description: `Sent to ${testEmail}` });
    } catch (error) {
      console.error('Error sending test email:', error);
      toast({ title: "Error sending test email", description: error instanceof Error ? error.message : 'Unknown error', variant: "destructive" });
    } finally {
      setIsSendingTest(false);
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
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, week_of: e.target.value }); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active_homes">Active Homes</Label>
              <Input
                id="active_homes"
                type="number"
                value={marketData.active_homes || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, active_homes: parseInt(e.target.value) || 0 }); }}
                placeholder="e.g., 2500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="active_homes_last_week">Active Homes Last Week</Label>
              <Input
                id="active_homes_last_week"
                type="number"
                value={marketData.active_homes_last_week || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, active_homes_last_week: parseInt(e.target.value) || 0 }); }}
                placeholder="e.g., 2450"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="market_avg_dom">Avg Days on Market</Label>
              <Input
                id="market_avg_dom"
                type="number"
                value={marketData.market_avg_dom || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, market_avg_dom: parseInt(e.target.value) || 0 }); }}
                placeholder="e.g., 45"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price_trend">Price Trend</Label>
              <Select 
                value={marketData.price_trend} 
                onValueChange={(value: 'up' | 'down' | 'stable') => { setHasUserEdited(true); setMarketData({ ...marketData, price_trend: value }); }}
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
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, price_reductions: parseInt(e.target.value) || 0 }); }}
                placeholder="e.g., 150"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortgage_rate_30yr">30-Yr Rate (Current %)</Label>
              <Input
                id="mortgage_rate_30yr"
                type="number"
                step="0.01"
                value={marketData.mortgage_rate_30yr || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, mortgage_rate_30yr: parseFloat(e.target.value) || undefined }); }}
                placeholder="e.g., 6.85"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortgage_rate_30yr_week_ago">30-Yr Rate (Last Week %)</Label>
              <Input
                id="mortgage_rate_30yr_week_ago"
                type="number"
                step="0.01"
                value={marketData.mortgage_rate_30yr_week_ago || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, mortgage_rate_30yr_week_ago: parseFloat(e.target.value) || undefined }); }}
                placeholder="e.g., 6.81"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortgage_rate_30yr_year_ago">30-Yr Rate (1 Year Ago %)</Label>
              <Input
                id="mortgage_rate_30yr_year_ago"
                type="number"
                step="0.01"
                value={marketData.mortgage_rate_30yr_year_ago || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, mortgage_rate_30yr_year_ago: parseFloat(e.target.value) || undefined }); }}
                placeholder="e.g., 6.67"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortgage_rate_15yr">15-Yr Rate (Current %)</Label>
              <Input
                id="mortgage_rate_15yr"
                type="number"
                step="0.01"
                value={marketData.mortgage_rate_15yr || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, mortgage_rate_15yr: parseFloat(e.target.value) || undefined }); }}
                placeholder="e.g., 6.10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortgage_rate_15yr_week_ago">15-Yr Rate (Last Week %)</Label>
              <Input
                id="mortgage_rate_15yr_week_ago"
                type="number"
                step="0.01"
                value={marketData.mortgage_rate_15yr_week_ago || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, mortgage_rate_15yr_week_ago: parseFloat(e.target.value) || undefined }); }}
                placeholder="e.g., 6.05"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mortgage_rate_15yr_year_ago">15-Yr Rate (1 Year Ago %)</Label>
              <Input
                id="mortgage_rate_15yr_year_ago"
                type="number"
                step="0.01"
                value={marketData.mortgage_rate_15yr_year_ago || ''}
                onChange={(e) => { setHasUserEdited(true); setMarketData({ ...marketData, mortgage_rate_15yr_year_ago: parseFloat(e.target.value) || undefined }); }}
                placeholder="e.g., 5.95"
              />
            </div>
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
          
          
          <div className="mt-4 flex justify-start">
            <Button
              variant="destructive"
              size="sm"
              disabled={isFetchingFreddieMac}
              onClick={async () => {
                // Re-fetch Freddie Mac data to ensure latest rates + commentary
                setIsFetchingFreddieMac(true);
                try {
                  const { data, error } = await supabase.functions.invoke('fetch-freddie-mac');
                  if (error) throw error;

                  const rates = data?.rates;
                  const updatedMarketData: MarketData = {
                    ...marketData,
                    freddie_mac_summary: data?.summary ?? marketData.freddie_mac_summary,
                    mortgage_rate_30yr: rates?.mortgage_rate_30yr ?? marketData.mortgage_rate_30yr,
                    mortgage_rate_30yr_week_ago: rates?.mortgage_rate_30yr_week_ago ?? marketData.mortgage_rate_30yr_week_ago,
                    mortgage_rate_30yr_year_ago: rates?.mortgage_rate_30yr_year_ago ?? marketData.mortgage_rate_30yr_year_ago,
                    mortgage_rate_15yr: rates?.mortgage_rate_15yr ?? marketData.mortgage_rate_15yr,
                    mortgage_rate_15yr_week_ago: rates?.mortgage_rate_15yr_week_ago ?? marketData.mortgage_rate_15yr_week_ago,
                    mortgage_rate_15yr_year_ago: rates?.mortgage_rate_15yr_year_ago ?? marketData.mortgage_rate_15yr_year_ago,
                  };

                  setMarketData(updatedMarketData);
                  const firstClient = clients?.[0] || null;
                  setEmailTemplate(generateSampleEmail(firstClient, updatedMarketData));
                  setTemplateDirty(true);
                  setIsTemplateOpen(true);
                  toast({ title: "Template updated with latest Freddie Mac rates" });
                } catch (err) {
                  console.error('Error fetching Freddie Mac:', err);
                  // Still update template with current market data
                  const firstClient = clients?.[0] || null;
                  setEmailTemplate(generateSampleEmail(firstClient, marketData));
                  setTemplateDirty(true);
                  setIsTemplateOpen(true);
                } finally {
                  setIsFetchingFreddieMac(false);
                }
              }}
            >
              {isFetchingFreddieMac ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Update Template
            </Button>
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
                  {saveEmailTemplate.isPending && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Saving...
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isTemplateOpen ? 'rotate-180' : ''}`} />
              </div>
              <CardDescription>Edit and customize your weekly email template (auto-saves)</CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="space-y-4">
                <Textarea
                  value={emailTemplate}
                  onChange={(e) => {
                    setEmailTemplate(e.target.value);
                    setTemplateDirty(true);
                  }}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Email template prompt..."
                />
                <div className="flex items-center gap-3">
                  <Button 
                    onClick={async () => {
                      try {
                        await saveEmailTemplate.mutateAsync(emailTemplate);
                        toast({
                          title: isMasterUser ? "Master template saved" : "Template saved",
                          description: isMasterUser
                            ? "All user templates have been reset to this master template."
                            : undefined,
                        });
                      } catch {
                        // handled by mutation onError
                      }
                    }}
                    disabled={saveEmailTemplate.isPending}
                    variant="outline"
                    size="sm"
                  >
                    {saveEmailTemplate.isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {isMasterUser ? "Save as Master Template" : "Save Template"}
                      </>
                    )}
                  </Button>
                  <Button 
                    onClick={handleSendTestEmail}
                    disabled={isSendingTest}
                    size="sm"
                  >
                    {isSendingTest ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </Button>
                  {(agentProfile?.preferred_email || user?.email) && (
                    <span className="text-sm text-muted-foreground">
                      to {agentProfile?.preferred_email || user?.email}
                    </span>
                  )}
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
          onClick={handleSendEmails}
          disabled={isGenerating || isSending || selectedClients.size === 0}
        >
          {isGenerating || isSending ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              {isGenerating ? 'Generating & Sending...' : 'Sending...'}
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send Emails
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
