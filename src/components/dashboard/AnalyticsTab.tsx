import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Eye, Calendar, TrendingUp, Sparkles, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface PredictiveInsight {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

const AnalyticsTab = () => {
  const [insights, setInsights] = useState<PredictiveInsight[]>([]);
  const [predictions, setPredictions] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchPredictiveAnalytics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-predictive-analytics');
      
      if (error) throw error;
      
      if (data?.predictions) {
        setPredictions(data.predictions);
      }
      if (data?.insights) {
        setInsights(data.insights);
      }
    } catch (error: any) {
      console.error('Error fetching predictive analytics:', error);
      toast({
        title: "Error",
        description: "Failed to fetch predictive analytics. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictiveAnalytics();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-2">Performance Analytics</h3>
          <p className="text-sm text-muted-foreground">Track engagement and campaign performance</p>
        </div>
        <Button 
          onClick={fetchPredictiveAnalytics} 
          disabled={loading}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh AI Insights
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              <Eye className="w-4 h-4 mr-2 text-primary" />
              Property Views
            </CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">--</div>
            <p className="text-xs text-muted-foreground mt-2">No data available yet</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-primary" />
              Showings Scheduled
            </CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">--</div>
            <p className="text-xs text-muted-foreground mt-2">No data available yet</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="w-4 h-4 mr-2 text-accent" />
              Email Open Rate
            </CardTitle>
            <CardDescription>Campaign performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">--</div>
            <p className="text-xs text-muted-foreground mt-2">Start sending emails to see metrics</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center">
              <BarChart3 className="w-4 h-4 mr-2 text-accent" />
              Market Insights
            </CardTitle>
            <CardDescription>Zillow data integration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">--</div>
            <p className="text-xs text-muted-foreground mt-2">Configure API to enable</p>
          </CardContent>
        </Card>
      </div>

      {predictions && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="shadow-soft border-primary/20">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center">
                <Sparkles className="w-4 h-4 mr-2 text-primary" />
                AI Prediction: Expected Deals
              </CardTitle>
              <CardDescription>This month forecast</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-primary">
                {predictions.expectedDealsThisMonth || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Based on your current pipeline
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-accent/20">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-accent" />
                Top Engaged Clients
              </CardTitle>
              <CardDescription>Most active this month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {predictions.topEngagedClients?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                High engagement detected
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {insights.length > 0 && (
        <Card className="shadow-soft bg-gradient-to-br from-primary/5 to-accent/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              AI-Powered Insights
            </CardTitle>
            <CardDescription>Machine learning predictions and trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {insights.map((insight, index) => (
                <div key={index} className="p-4 rounded-lg bg-background border border-border">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold">{insight.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded ${
                      insight.impact === 'high' ? 'bg-destructive/10 text-destructive' :
                      insight.impact === 'medium' ? 'bg-accent/10 text-accent' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {insight.impact} impact
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Upcoming Features</CardTitle>
          <CardDescription>Coming soon to enhance your CRM experience</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Automated Thursday email campaigns with Zillow property updates</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>ShowingTime API integration for showing analytics</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Advanced client engagement tracking</span>
            </li>
            <li className="flex items-start">
              <span className="text-primary mr-2">•</span>
              <span>Market trend visualization and reports</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsTab;
