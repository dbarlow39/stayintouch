import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Trash2, Loader2, Asterisk, Zap, FileText, BarChart3, GitBranch, DollarSign, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LeadEnrollmentDialog from "@/components/dashboard/LeadEnrollmentDialog";
import logo from "@/assets/logo.jpg";
import LeadEstimatedNet from "@/components/dashboard/estimatedNet/LeadEstimatedNet";
import ResidentialWorkSheetTab from "@/components/dashboard/ResidentialWorkSheetTab";

const statusColors: Record<string, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-accent/10 text-accent-foreground border-accent/20",
  qualified: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  unqualified: "bg-destructive/10 text-destructive border-destructive/20",
  nurturing: "bg-secondary/50 text-secondary-foreground border-border",
};

const SellerLeadDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lookingUpAddress, setLookingUpAddress] = useState(false);
  const [addressSuggestion, setAddressSuggestion] = useState<{ address: string; city: string; state: string; zip: string; owner_name: string } | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const lookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("details");

  const [formData, setFormData] = useState({
    address: "",
    first_name: "",
    last_name: "",
    city: "",
    state: "OH",
    zip: "",
    email: "",
    phone: "",
    status: "new",
    source: "",
    notes: "",
  });

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  useEffect(() => {
    if (lead) {
      setFormData({
        address: (lead as any).address || "",
        first_name: lead.first_name || "",
        last_name: lead.last_name || "",
        city: (lead as any).city || "",
        state: (lead as any).state || "OH",
        zip: (lead as any).zip || "",
        email: lead.email || "",
        phone: lead.phone || "",
        status: lead.status || "new",
        source: lead.source || "",
        notes: lead.notes || "",
      });
    }
  }, [lead]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updateData = {
        ...formData,
        status: formData.status as "new" | "contacted" | "qualified" | "unqualified" | "nurturing",
      };
      const { error } = await supabase.from("leads").update(updateData).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      toast({ title: "Seller lead updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating lead", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Seller lead deleted successfully" });
      navigate("/dashboard?tab=leads");
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting lead", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  if (authLoading || isLoading) {
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

  const sidebarTabs = [
    { id: "details", label: "Lead Details", icon: FileText },
    { id: "pre-listing", label: "Pre-Listing Pack", icon: FileText },
    { id: "market-analysis", label: "Market Analysis", icon: BarChart3 },
    { id: "estimated-net", label: "Estimated Net", icon: DollarSign },
    { id: "residential", label: "Residential Work Sheet", icon: ClipboardList },
    { id: "pipeline", label: "Pipeline", icon: GitBranch },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={logo} alt="Sell for 1 Percent" className="h-12 w-auto" />
            <div>
              <h1 className="text-xl font-bold">Seller Lead Detail</h1>
              <p className="text-xs text-muted-foreground">
                {lead ? `${lead.first_name} ${lead.last_name}` : "Loading..."}
              </p>
            </div>
          </div>
          <div />

        </div>
      </header>

      <div className="flex min-h-[calc(100vh-73px)]">
        {/* Vertical Sidebar Navigation */}
        <nav className="w-48 shrink-0 border-r border-border bg-muted/30">
          <button
            onClick={() => navigate("/dashboard?tab=leads")}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left text-muted-foreground hover:bg-muted hover:text-foreground border-b border-border transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            Back to Leads
          </button>
          <ul className="flex flex-col py-2">
            {sidebarTabs.map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-4 py-3 text-sm text-left transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <tab.icon className="w-4 h-4 shrink-0" />
                  {tab.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main Content */}
        {activeTab === "estimated-net" && lead ? (
          <div className="flex-1 overflow-auto">
            <LeadEstimatedNet lead={lead} />
          </div>
        ) : activeTab === "residential" ? (
          <div className="flex-1 overflow-auto p-6">
            <ResidentialWorkSheetTab />
          </div>
        ) : (
          <main className="flex-1 px-6 py-8 max-w-3xl">
            {activeTab === "details" && (
              <Card className="shadow-medium">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Lead Details</CardTitle>
                  <div className="flex items-center gap-2">
                    {lead && (
                      <Badge className={statusColors[lead.status] || ""}>
                        {lead.status}
                      </Badge>
                    )}
                    {lead && (
                      <LeadEnrollmentDialog
                        leadId={lead.id}
                        leadName={`${lead.first_name} ${lead.last_name}`}
                        trigger={
                          <Button variant="outline" size="sm">
                            <Zap className="w-4 h-4 mr-1" />
                            Sequences
                          </Button>
                        }
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2 relative" ref={suggestionsRef}>
                      <Label htmlFor="address" className="flex items-center gap-1">
                        Property Address {lookingUpAddress && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                      </Label>
                      <Input
                        id="address"
                        placeholder="Enter street address"
                        value={formData.address}
                        onChange={(e) => {
                          const address = e.target.value;
                          setFormData({ ...formData, address });
                          setAddressSuggestion(null);
                          setShowSuggestions(false);
                          if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
                          if (address.length > 10) {
                            lookupTimeoutRef.current = setTimeout(async () => {
                              setLookingUpAddress(true);
                              try {
                                const { data, error } = await supabase.functions.invoke('lookup-property', {
                                  body: { address, state: formData.state || 'OH' }
                                });
                                if (!error && data && !data.error && (data.city || data.zip || data.owner_name)) {
                                  setAddressSuggestion({
                                    address,
                                    city: data.city || "",
                                    state: data.state || "OH",
                                    zip: data.zip || "",
                                    owner_name: data.owner_name || "",
                                  });
                                  setShowSuggestions(true);
                                }
                              } catch (err) {
                                console.error("Address lookup error:", err);
                              } finally {
                                setLookingUpAddress(false);
                              }
                            }, 1000);
                          }
                        }}
                        onFocus={() => { if (addressSuggestion) setShowSuggestions(true); }}
                      />
                      {showSuggestions && addressSuggestion && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent/50 text-sm transition-colors"
                            onClick={() => {
                              const titleCase = (s: string) => s ? s.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ") : "";
                              const ownerName = addressSuggestion.owner_name;
                              const parts = ownerName.split(" ");
                              const firstName = parts[0] || "";
                              const lastName = parts.slice(1).join(" ") || "";
                              setFormData(prev => ({
                                ...prev,
                                first_name: prev.first_name || titleCase(firstName),
                                last_name: prev.last_name || titleCase(lastName),
                                city: titleCase(addressSuggestion.city) || prev.city,
                                state: addressSuggestion.state || prev.state,
                                zip: addressSuggestion.zip || prev.zip,
                              }));
                              setShowSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{formData.address}</div>
                            <div className="text-xs text-muted-foreground">
                              {[addressSuggestion.city, addressSuggestion.state, addressSuggestion.zip].filter(Boolean).join(", ")}
                              {addressSuggestion.owner_name && ` • Owner: ${addressSuggestion.owner_name}`}
                            </div>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="first_name" className="flex items-center gap-1">
                          First Name <Asterisk className="w-3 h-3 text-destructive" />
                        </Label>
                        <Input
                          id="first_name"
                          value={formData.first_name}
                          onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="last_name" className="flex items-center gap-1">
                          Last Name <Asterisk className="w-3 h-3 text-destructive" />
                        </Label>
                        <Input
                          id="last_name"
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State</Label>
                        <Input
                          id="state"
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zip">Zip</Label>
                        <Input
                          id="zip"
                          value={formData.zip}
                          onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="qualified">Qualified</SelectItem>
                            <SelectItem value="unqualified">Unqualified</SelectItem>
                            <SelectItem value="nurturing">Nurturing</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="source">Source</Label>
                        <Input
                          id="source"
                          placeholder="Website, Referral, etc."
                          value={formData.source}
                          onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        rows={4}
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      />
                    </div>

                    <div className="flex justify-between pt-4">
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this seller lead?")) {
                            deleteMutation.mutate();
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Lead
                      </Button>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => navigate("/dashboard?tab=leads")}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={updateMutation.isPending}>
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}

            {activeTab === "pre-listing" && (
              <Card>
                <CardHeader>
                  <CardTitle>Pre-Listing Pack</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Pre-listing pack content coming soon.</p>
                </CardContent>
              </Card>
            )}

            {activeTab === "market-analysis" && (
              <Card>
                <CardHeader>
                  <CardTitle>Market Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Market analysis content coming soon.</p>
                </CardContent>
              </Card>
            )}

            {activeTab === "pipeline" && (
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">Pipeline content coming soon.</p>
                </CardContent>
              </Card>
            )}
          </main>
        )}
      </div>
    </div>
  );
};

export default SellerLeadDetail;
