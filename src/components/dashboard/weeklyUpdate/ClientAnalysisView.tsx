import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Eye, Heart, Calendar, Home, TrendingUp, Users, MessageSquare, RefreshCw, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

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
  showings_to_date: number | null;
  mls_id: string | null;
  days_on_market: number | null;
  price: number | null;
}

interface ZillowStats {
  views: number | null;
  saves: number | null;
  days: number | null;
}

interface ClientStatsViewProps {
  client: Client;
  onBack: () => void;
}

const ClientStatsView = ({ client, onBack }: ClientStatsViewProps) => {
  const { user } = useAuth();
  const [zillowStats, setZillowStats] = useState<ZillowStats | null>(null);
  const [isLoadingZillow, setIsLoadingZillow] = useState(false);
  const [zillowError, setZillowError] = useState<string | null>(null);
  
  // Fetch showing feedback from database - this gives us IMMEDIATE data
  const { data: showingFeedback = [], isLoading: isLoadingFeedback } = useQuery({
    queryKey: ["showing-feedback", client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("showing_feedback")
        .select("*")
        .eq("client_id", client.id)
        .not("source_email_id", "is", null)
        .order("showing_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!client.id,
  });

  // Calculate ShowingTime stats from database records (instant - no API call!)
  const showingTimeStats = useMemo(() => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    if (!showingFeedback || showingFeedback.length === 0) {
      return {
        totalShowings: client.showings_to_date ?? 0,
        showingsThisWeek: 0,
        lastShowingDate: null as string | null,
      };
    }

    const showingsThisWeek = showingFeedback.filter(f => {
      if (!f.showing_date) return false;
      const showDate = new Date(f.showing_date);
      return showDate >= oneWeekAgo;
    }).length;

    const lastShowing = showingFeedback.find(f => f.showing_date);
    const lastShowingDate = lastShowing?.showing_date 
      ? new Date(lastShowing.showing_date).toLocaleDateString()
      : null;

    // Use the larger of: feedback count or stored showings_to_date
    const totalShowings = Math.max(showingFeedback.length, client.showings_to_date ?? 0);

    return {
      totalShowings,
      showingsThisWeek,
      lastShowingDate,
    };
  }, [showingFeedback, client.showings_to_date]);

  // Fetch Zillow stats on mount if client has zillow_link
  useEffect(() => {
    if (client.zillow_link) {
      fetchZillowStats();
    }
  }, [client.zillow_link]);

  const fetchZillowStats = async () => {
    if (!client.zillow_link) return;
    
    setIsLoadingZillow(true);
    setZillowError(null);
    
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-zillow`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${session?.data?.session?.access_token}`,
          },
          body: JSON.stringify({ zillow_url: client.zillow_link }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch Zillow stats');
      }
      
      const data = await response.json();
      setZillowStats({
        views: data.views,
        saves: data.saves,
        days: data.days,
      });
    } catch (error) {
      console.error('Error fetching Zillow stats:', error);
      setZillowError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingZillow(false);
    }
  };

  const propertyAddress = [client.street_number, client.street_name].filter(Boolean).join(' ');
  const fullAddress = [propertyAddress, client.city, client.state, client.zip].filter(Boolean).join(', ');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">
            {client.first_name} {client.last_name}
          </h2>
          <p className="text-muted-foreground flex items-center gap-2">
            <Home className="h-4 w-4" />
            {fullAddress || 'No address on file'}
          </p>
        </div>
        {client.price && (
          <Badge variant="outline" className="text-lg px-4 py-2">
            ${client.price.toLocaleString()}
          </Badge>
        )}
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingZillow ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    zillowStats?.days ?? client.days_on_market ?? '-'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Days on Market</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingFeedback ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    showingTimeStats.totalShowings || '-'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Total Showings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingZillow ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    zillowStats?.views?.toLocaleString() ?? '-'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Online Views</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Heart className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingZillow ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    zillowStats?.saves ?? '-'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Saves</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Zillow Stats Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Zillow Statistics
            </CardTitle>
            <CardDescription>Online engagement metrics from Zillow</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {client.zillow_link && (
              <Button variant="outline" size="sm" asChild>
                <a href={client.zillow_link} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View on Zillow
                </a>
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchZillowStats}
              disabled={isLoadingZillow || !client.zillow_link}
            >
              {isLoadingZillow ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!client.zillow_link ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No Zillow link configured for this property.</p>
              <p className="text-sm">Add a Zillow link to track online engagement.</p>
            </div>
          ) : zillowError ? (
            <div className="text-center py-8 text-destructive">
              <p>Error fetching Zillow stats: {zillowError}</p>
            </div>
          ) : isLoadingZillow ? (
            <div className="grid grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center">
                  <Skeleton className="h-12 w-24 mx-auto mb-2" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
              ))}
            </div>
          ) : zillowStats ? (
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-4xl font-bold text-primary">
                  {zillowStats.views?.toLocaleString() ?? '-'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Total Views</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-4xl font-bold text-primary">
                  {zillowStats.saves ?? '-'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Buyer Saves</p>
              </div>
              <div className="text-center p-4 bg-muted/50 rounded-lg">
                <p className="text-4xl font-bold text-primary">
                  {zillowStats.days ?? '-'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Days Listed</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>Click refresh to load Zillow statistics.</p>
            </div>
          )}
          
          {/* Conversion Metrics */}
          {zillowStats?.views && showingTimeStats.totalShowings > 0 && (
            <div className="mt-6 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <h4 className="font-medium mb-2">Conversion Analysis</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Views to Showings Ratio:</span>
                  <span className="font-medium ml-2">
                    {Math.round(zillowStats.views / showingTimeStats.totalShowings)}:1
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Expected Showings (2-4 per 200 views):</span>
                  <span className="font-medium ml-2">
                    {Math.round((zillowStats.views / 200) * 2)} - {Math.round((zillowStats.views / 200) * 4)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ShowingTime Stats Section - Now uses database data (instant!) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              ShowingTime Statistics
            </CardTitle>
            <CardDescription>Showing activity from synced emails (instant)</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingFeedback ? (
            <div className="grid grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="text-center">
                  <Skeleton className="h-12 w-24 mx-auto mb-2" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-4xl font-bold text-primary">
                    {showingTimeStats.totalShowings || '-'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Total Showings</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-4xl font-bold text-primary">
                    {showingTimeStats.showingsThisWeek || '-'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">This Week</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-muted-foreground">
                    {showingTimeStats.lastShowingDate ?? '-'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Last Showing</p>
                </div>
              </div>
              
              {showingFeedback.length === 0 && !client.showings_to_date && (
                <p className="text-center text-sm text-muted-foreground">
                  No showing data yet. Sync your Gmail to import ShowingTime emails.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Showing Feedback from Database */}
      {showingFeedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Showing Feedback History
            </CardTitle>
            <CardDescription>Feedback received from showing agents</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {showingFeedback.map((feedback) => (
                <div key={feedback.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {feedback.showing_agent_name && (
                        <span className="font-medium">{feedback.showing_agent_name}</span>
                      )}
                      {feedback.buyer_interest_level && (
                        <Badge 
                          variant={
                            feedback.buyer_interest_level === 'high' ? 'default' :
                            feedback.buyer_interest_level === 'medium' ? 'secondary' : 'outline'
                          }
                        >
                          {feedback.buyer_interest_level} interest
                        </Badge>
                      )}
                    </div>
                    {feedback.showing_date && (
                      <span className="text-sm text-muted-foreground">
                        {new Date(feedback.showing_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {feedback.feedback && (
                    <p className="text-sm text-muted-foreground">{feedback.feedback}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ClientStatsView;
