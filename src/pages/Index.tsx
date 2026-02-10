import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Users, Mail, Shield, Clock } from "lucide-react";
import logo from "@/assets/logo.jpg";

const isListingsSubdomain = () => {
  const host = window.location.hostname;
  return host.startsWith('listings.');
};

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isListingsSubdomain()) {
      navigate("/listings", { replace: true });
      return;
    }
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-primary/5">
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={logo} alt="Sell for 1 Percent" className="h-14 w-auto" />
            <div>
              <h1 className="text-2xl font-bold">My Real Estate Office</h1>
              <p className="text-sm text-muted-foreground">Real Estate CRM</p>
            </div>
          </div>
          <Button onClick={() => navigate("/auth")}>Get Started</Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center mb-16 animate-fade-in">
          <h2 className="text-5xl font-bold mb-6 leading-tight">
            The <span className="text-primary">Secure CRM</span> for <br />Real Estate Agents
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Manage clients, automate personalized emails, and track performance—all with bank-level security
          </p>
          <Button size="lg" onClick={() => navigate("/auth")} className="shadow-medium">
            Start Free Trial
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto mb-20">
          <div className="p-6 rounded-2xl bg-card shadow-soft animate-fade-in border border-border/50">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Client Management</h3>
            <p className="text-muted-foreground">
              Encrypted storage for client contacts with CSV import and personalized records
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-card shadow-soft animate-fade-in border border-border/50" style={{ animationDelay: "0.1s" }}>
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
              <Mail className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Automated Emails</h3>
            <p className="text-muted-foreground">
              Thursday email campaigns with Zillow property updates and ShowingTime data
            </p>
          </div>

        </div>

        <div className="max-w-3xl mx-auto bg-card rounded-2xl p-8 shadow-medium animate-fade-in border border-border/50">
          <h3 className="text-2xl font-bold mb-6 text-center">Built with Security in Mind</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start space-x-3">
              <Shield className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Encrypted Authentication</h4>
                <p className="text-sm text-muted-foreground">Secure login with industry-standard encryption</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Shield className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Role-Based Access</h4>
                <p className="text-sm text-muted-foreground">Admin-only controls for sensitive operations</p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Clock className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Automated Scheduling</h4>
                <p className="text-sm text-muted-foreground">Set and forget with Thursday email automation</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-8 mt-20">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>© 2024 My Real Estate Office. Professional Real Estate CRM.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
