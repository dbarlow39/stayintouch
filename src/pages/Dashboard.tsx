import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Mail, LogOut, Calendar, Briefcase, CheckSquare, MessageSquare, Sparkles, Settings, UserPlus } from "lucide-react";
import ClientsTab from "@/components/dashboard/ClientsTab";
import LeadsTab from "@/components/dashboard/LeadsTab";
import WeeklyUpdateTab from "@/components/dashboard/WeeklyUpdateTab";
import DealsTab from "@/components/dashboard/DealsTab";
import TasksTab from "@/components/dashboard/TasksTab";
import SMSTab from "@/components/dashboard/SMSTab";
import SmartAssistantTab from "@/components/dashboard/SmartAssistantTab";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo.jpg";

const Dashboard = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const { data: clientsCount = 0 } = useQuery({
    queryKey: ["clients-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", user!.id);
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  const { data: activeClientsCount = 0 } = useQuery({
    queryKey: ["active-clients-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("agent_id", user!.id)
        .ilike("status", "A");
      
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={logo} alt="Sell for 1 Percent" className="h-12 w-auto" />
            <div>
              <h1 className="text-xl font-bold">Stay in Touch</h1>
              <p className="text-xs text-muted-foreground">Real Estate CRM</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/account")}>
              <Settings className="w-4 h-4 mr-2" />
              Account
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 animate-fade-in">
          <h2 className="text-3xl font-bold mb-2">Welcome back!</h2>
          <p className="text-muted-foreground">Manage your clients and track your performance</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-fade-in">
          <Card className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeClientsCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Active clients • {clientsCount} total
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground mt-1">This month</p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-medium animate-fade-in">
          <Tabs defaultValue="clients" className="w-full">
            <CardHeader>
              <TabsList className="w-full justify-start grid grid-cols-3 lg:flex">
                <TabsTrigger value="assistant">
                  <Sparkles className="w-4 h-4 mr-2" />
                  AI Assistant
                </TabsTrigger>
                <TabsTrigger value="clients">
                  <Users className="w-4 h-4 mr-2" />
                  Clients
                </TabsTrigger>
                <TabsTrigger value="leads">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Leads
                </TabsTrigger>
                <TabsTrigger value="weekly">
                  <Calendar className="w-4 h-4 mr-2" />
                  Weekly Update
                </TabsTrigger>
                <TabsTrigger value="deals">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Deals
                </TabsTrigger>
                <TabsTrigger value="tasks">
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="sms">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  SMS
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="assistant">
                <SmartAssistantTab />
              </TabsContent>
              <TabsContent value="clients">
                <ClientsTab />
              </TabsContent>
              <TabsContent value="leads">
                <LeadsTab />
              </TabsContent>
              <TabsContent value="weekly">
                <WeeklyUpdateTab />
              </TabsContent>
              <TabsContent value="deals">
                <DealsTab />
              </TabsContent>
              <TabsContent value="tasks">
                <TasksTab />
              </TabsContent>
              <TabsContent value="sms">
                <SMSTab />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </main>
    </div>
  );
};

export default Dashboard;
