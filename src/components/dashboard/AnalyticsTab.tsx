import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Eye, Calendar, TrendingUp } from "lucide-react";

const AnalyticsTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Performance Analytics</h3>
        <p className="text-sm text-muted-foreground">Track engagement and campaign performance</p>
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
