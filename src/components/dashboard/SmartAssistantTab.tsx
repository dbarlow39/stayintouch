import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, Target, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

interface Recommendation {
  action: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
  relatedTo: string;
  estimatedImpact: string;
}

const SmartAssistantTab = () => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-recommendations');
      
      if (error) throw error;
      
      if (data?.recommendations) {
        setRecommendations(data.recommendations);
      }
    } catch (error: any) {
      console.error('Error fetching recommendations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch AI recommendations. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-destructive text-destructive-foreground';
      case 'medium':
        return 'bg-accent text-accent-foreground';
      case 'low':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
        return <AlertCircle className="w-4 h-4" />;
      case 'medium':
        return <Target className="w-4 h-4" />;
      case 'low':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Smart Assistant
          </h3>
          <p className="text-sm text-muted-foreground">
            Intelligent recommendations powered by machine learning
          </p>
        </div>
        <Button 
          onClick={fetchRecommendations} 
          disabled={loading}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading && recommendations.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Analyzing your data...</p>
          </CardContent>
        </Card>
      ) : recommendations.length === 0 ? (
        <Card className="shadow-soft">
          <CardContent className="p-12 text-center">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No recommendations yet</h3>
            <p className="text-sm text-muted-foreground">
              Start adding leads and deals to get AI-powered insights
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec, index) => (
            <Card key={index} className="shadow-soft hover:shadow-medium transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${getPriorityColor(rec.priority)}`}>
                      {getPriorityIcon(rec.priority)}
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-base mb-1">{rec.action}</CardTitle>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">
                          {rec.relatedTo}
                        </Badge>
                        <Badge className={getPriorityColor(rec.priority)}>
                          {rec.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-1">Why this matters:</p>
                  <p className="text-sm text-muted-foreground">{rec.reasoning}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-accent" />
                  <span className="font-medium">Impact:</span>
                  <span className="text-muted-foreground">{rec.estimatedImpact}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmartAssistantTab;