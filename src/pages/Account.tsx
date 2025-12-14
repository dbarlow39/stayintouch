import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
              <h1 className="text-xl font-bold">Stay in Touch</h1>
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
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://www.Sellfor1Percent.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleChange("bio", e.target.value)}
                  placeholder="Tell your clients a little about yourself..."
                  className="min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Optional bio for personalized communications
                </p>
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
      </main>
    </div>
  );
};

export default Account;
