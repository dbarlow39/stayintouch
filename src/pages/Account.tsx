import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, User, Mail, RefreshCw, CheckCircle, XCircle, Settings, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmailClient, EMAIL_CLIENT_OPTIONS, getEmailClientPreference, setEmailClientPreference } from "@/utils/emailClientUtils";
import logo from "@/assets/logo.jpg";

interface AgentProfile {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  cell_phone: string | null;
  preferred_email: string | null;
  website: string | null;
  bio: string | null;
  profile_completed: boolean | null;
  mls_agent_id: string | null;
}

const Account = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    cell_phone: "",
    preferred_email: "",
    website: "",
    bio: "",
    mls_agent_id: "",
  });

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["agent-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();

      if (error) throw error;
      return data as AgentProfile | null;
    },
    enabled: !!user,
  });

  // Query Gmail connection status
  const { data: gmailToken, isLoading: gmailLoading, refetch: refetchGmail } = useQuery({
    queryKey: ["gmail-token", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gmail_oauth_tokens")
        .select("email_address, updated_at")
        .eq("agent_id", user!.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!user,
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const [emailClient, setEmailClientState] = useState<EmailClient>(getEmailClientPreference);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false);

  // Check if user is admin
  const { data: isAdmin } = useQuery({
    queryKey: ["user-is-admin", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  // Fetch current invite code (admin only)
  const { data: currentInviteCode } = useQuery({
    queryKey: ["invite-code"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("invite_code")
        .eq("id", "default")
        .single();
      return data?.invite_code || "";
    },
    enabled: !!isAdmin,
  });

  useEffect(() => {
    if (currentInviteCode) setInviteCode(currentInviteCode);
  }, [currentInviteCode]);

  const handleSaveInviteCode = async () => {
    if (!inviteCode.trim()) return;
    setInviteCodeLoading(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({ invite_code: inviteCode.trim(), updated_at: new Date().toISOString() })
        .eq("id", "default");
      if (error) throw error;
      toast({ title: "Invite code updated", description: "New users will need this code to sign up." });
    } catch (err) {
      toast({ title: "Error", description: "Failed to update invite code", variant: "destructive" });
    } finally {
      setInviteCodeLoading(false);
    }
  };

  const handleEmailClientChange = (value: string) => {
    const client = value as EmailClient;
    setEmailClientState(client);
    setEmailClientPreference(client);
    toast({
      title: "Email Preference Saved",
      description: `Emails will now open in ${EMAIL_CLIENT_OPTIONS.find(o => o.value === client)?.label}`,
    });
  };

  const handleConnectGmail = async () => {
    try {
      // Get the OAuth URL from the backend (uses GOOGLE_CLIENT_ID secret)
      const { data, error } = await supabase.functions.invoke("gmail-auth-url", {
        body: { agent_id: user!.id },
      });

      if (error || !data?.auth_url) {
        throw new Error(error?.message || "Failed to get auth URL");
      }

      // Open in popup
      window.open(data.auth_url, "gmail-oauth", "width=500,height=600");

      // Listen for success message
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "gmail-oauth-success") {
          refetchGmail();
          toast({ title: "Gmail Connected!", description: `Connected to ${event.data.email}` });
          window.removeEventListener("message", handleMessage);
        }
      };
      window.addEventListener("message", handleMessage);
    } catch (err) {
      console.error("Gmail connect error:", err);
      toast({
        title: "Connection Failed",
        description: err instanceof Error ? err.message : "Could not start Gmail connection",
        variant: "destructive",
      });
    }
  };

  const handleSyncGmail = async () => {
    setIsSyncing(true);
    try {
      // Manual sync looks back 60 days to capture all recent ShowingTime feedback
      const { data, error } = await supabase.functions.invoke("sync-gmail-emails", {
        body: { agent_id: user!.id, days_back: 60, max_results: 500 },
      });

      if (error) throw error;

      toast({
        title: "Gmail Synced!",
        description: `${data.message || `Synced ${data.synced_count} emails`}${data?._version ? ` (backend: ${data._version})` : ""}`,
      });
      
      if (data.showingtime_count > 0) {
        toast({
          title: "ShowingTime Feedback Found",
          description: `Found ${data.showingtime_count} ShowingTime notifications`,
        });
      }
    } catch (err) {
      console.error("Gmail sync error:", err);
      toast({
        title: "Sync Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Populate form when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || "",
        last_name: profile.last_name || "",
        cell_phone: profile.cell_phone || "",
        preferred_email: profile.preferred_email || profile.email || "",
        website: profile.website || "",
        bio: profile.bio || "",
        mls_agent_id: profile.mls_agent_id || "",
      });
    } else if (user) {
      // Pre-fill with user email if no profile exists
      setFormData(prev => ({
        ...prev,
        preferred_email: user.email || "",
      }));
    }
  }, [profile, user]);

  const saveProfile = useMutation({
    mutationFn: async (data: typeof formData) => {
      const profileData = {
        ...data,
        full_name: `${data.first_name} ${data.last_name}`.trim(),
        profile_completed: true,
        updated_at: new Date().toISOString(),
      };

      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from("profiles")
          .update(profileData)
          .eq("id", user!.id);
        if (error) throw error;
      } else {
        // Insert new profile
        const { error } = await supabase
          .from("profiles")
          .insert({
            id: user!.id,
            email: user!.email || "",
            ...profileData,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-profile"] });
      toast({ title: "Profile saved", description: "Your account information has been updated" });
    },
    onError: (error) => {
      console.error("Error saving profile:", error);
      toast({ 
        title: "Error saving profile", 
        description: error instanceof Error ? error.message : "Unknown error", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile.mutate(formData);
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (loading || profileLoading) {
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

  const isNewUser = !profile?.profile_completed;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={logo} alt="Sell for 1 Percent" className="h-12 w-auto" />
            <div>
              <h1 className="text-xl font-bold">My Real Estate Office</h1>
              <p className="text-xs text-muted-foreground">Account Settings</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-8 animate-fade-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">
                {isNewUser ? "Complete Your Profile" : "Account Settings"}
              </h2>
              <p className="text-muted-foreground">
                {isNewUser 
                  ? "Please fill in your information to get started" 
                  : "Update your profile information"
                }
              </p>
            </div>
          </div>
        </div>

        <Card className="shadow-medium animate-fade-in">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              This information will be used in your email correspondence with clients
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name *</Label>
                  <Input
                    id="first_name"
                    value={formData.first_name}
                    onChange={(e) => handleChange("first_name", e.target.value)}
                    placeholder="Dave"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name *</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => handleChange("last_name", e.target.value)}
                    placeholder="Barlow"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cell_phone">Cell Phone *</Label>
                <Input
                  id="cell_phone"
                  type="tel"
                  value={formData.cell_phone}
                  onChange={(e) => handleChange("cell_phone", e.target.value)}
                  placeholder="614-778-6616"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="preferred_email">Email Address *</Label>
                <Input
                  id="preferred_email"
                  type="email"
                  value={formData.preferred_email}
                  onChange={(e) => handleChange("preferred_email", e.target.value)}
                  placeholder="dave@sellfor1percent.com"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  This email will be used for client correspondence and test emails
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="text"
                  value={formData.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="www.Sellfor1Percent.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mls_agent_id">MLS Agent ID <span className="text-xs font-normal text-muted-foreground">(Not your state license #, but your MLS ID ie: '658016716')</span></Label>
                <Input
                  id="mls_agent_id"
                  type="text"
                  value={formData.mls_agent_id}
                  onChange={(e) => handleChange("mls_agent_id", e.target.value)}
                  placeholder="e.g. 12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Signature Line</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleChange("bio", e.target.value)}
                  placeholder="Enter your email signature (text or HTML)..."
                  className="min-h-[120px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Your signature line for email correspondence. Supports plain text or HTML.
                </p>
                {formData.bio && formData.bio.includes("<") && (
                  <div className="mt-2 p-3 border rounded-md bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Preview:</p>
                    <div className="text-sm" dangerouslySetInnerHTML={{ __html: formData.bio }} />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      {isNewUser ? "Complete Setup" : "Save Changes"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Gmail Integration Card */}
        <Card className="shadow-medium animate-fade-in mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Gmail Integration
            </CardTitle>
            <CardDescription>
              Connect your Gmail to automatically log client emails and ShowingTime feedback
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {gmailLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Checking connection...
              </div>
            ) : gmailToken ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-primary">
                  <CheckCircle className="w-5 h-5" />
                  <span>Connected to <strong>{gmailToken.email_address}</strong></span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSyncGmail} 
                    disabled={isSyncing}
                    variant="outline"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Emails Now
                      </>
                    )}
                  </Button>
                  <Button onClick={handleConnectGmail} variant="ghost" size="sm">
                    Reconnect
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last synced: {gmailToken.updated_at ? new Date(gmailToken.updated_at).toLocaleString() : "Never"}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-5 h-5" />
                  <span>Gmail not connected</span>
                </div>
                <Button onClick={handleConnectGmail}>
                  <Mail className="w-4 h-4 mr-2" />
                  Connect Gmail
                </Button>
                <p className="text-xs text-muted-foreground">
                  This will allow the app to read your emails to log client communications and extract ShowingTime feedback automatically.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Client Preference Card */}
        <Card className="shadow-medium animate-fade-in mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Email Preferences
            </CardTitle>
            <CardDescription>
              Choose which email application to use when composing emails throughout the app
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-client">Default Email Client</Label>
              <Select value={emailClient} onValueChange={handleEmailClientChange}>
                <SelectTrigger id="email-client" className="w-full max-w-xs">
                  <SelectValue placeholder="Select email client" />
                </SelectTrigger>
                <SelectContent>
                  {EMAIL_CLIENT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This setting applies to all email links throughout the application
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Invite Code Management (Admin Only) */}
        {isAdmin && (
          <Card className="shadow-medium animate-fade-in mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" />
                Invite Code
              </CardTitle>
              <CardDescription>
                Set the code that new users must enter to create an account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-code">Current Invite Code</Label>
                <div className="flex gap-2">
                  <Input
                    id="invite-code"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter invite code"
                    className="max-w-xs"
                  />
                  <Button onClick={handleSaveInviteCode} disabled={inviteCodeLoading}>
                    {inviteCodeLoading ? "Saving..." : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this code with people you want to grant access to the app
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Account;
