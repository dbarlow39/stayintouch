// cache-bust: 2026-04-17T15b
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Trash2, Loader2, Asterisk, Zap, FileText, BarChart3, GitBranch, DollarSign, ClipboardList, UserCheck, Mail, Pencil } from "lucide-react";
import PhoneCallTextLink from "@/components/PhoneCallTextLink";
import { openEmailClient } from "@/utils/emailClientUtils";
import { useToast } from "@/hooks/use-toast";
import LeadEnrollmentDialog from "@/components/dashboard/LeadEnrollmentDialog";
import logo from "@/assets/logo.jpg";
import LeadEstimatedNet from "@/components/dashboard/estimatedNet/LeadEstimatedNet";
import ResidentialWorkSheetTab from "@/components/dashboard/ResidentialWorkSheetTab";
import MarketAnalysisTab from "@/components/dashboard/sellerLead/MarketAnalysisTab";
import MLSDescriptionTab from "@/components/dashboard/sellerLead/MLSDescriptionTab";

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
  const [refreshingEstated, setRefreshingEstated] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

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
    // Cached property data (from Estated, pulled once at lead creation)
    bedrooms: "",
    bathrooms: "",
    square_feet: "",
    year_built: "",
    annual_taxes: "",
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
        bedrooms: (lead as any).bedrooms != null ? String((lead as any).bedrooms) : "",
        bathrooms: (lead as any).bathrooms != null ? String((lead as any).bathrooms) : "",
        square_feet: (lead as any).square_feet != null ? String((lead as any).square_feet) : "",
        year_built: (lead as any).year_built != null ? String((lead as any).year_built) : "",
        annual_taxes: (lead as any).annual_taxes != null ? String((lead as any).annual_taxes) : "",
      });
    }
  }, [lead]);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }

    if (!authLoading && !user) {
      // Delay redirect to give auth token refresh time to complete
      redirectTimerRef.current = setTimeout(() => {
        navigate("/auth");
      }, 2000);
    }

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [user, authLoading, navigate]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const oldAddress = lead?.address?.trim() || "";
      const newAddress = formData.address?.trim() || "";

      const toNumOrNull = (s: string): number | null => {
        if (s === "" || s == null) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };

      const updateData = {
        address: formData.address,
        first_name: formData.first_name,
        last_name: formData.last_name,
        city: formData.city,
        state: formData.state,
        zip: formData.zip,
        email: formData.email,
        phone: formData.phone,
        source: formData.source,
        notes: formData.notes,
        status: formData.status as "new" | "contacted" | "qualified" | "unqualified" | "nurturing",
        // Cached property data — editable on this page, never re-pulled automatically
        bedrooms: toNumOrNull(formData.bedrooms),
        bathrooms: toNumOrNull(formData.bathrooms),
        square_feet: toNumOrNull(formData.square_feet),
        year_built: toNumOrNull(formData.year_built),
        annual_taxes: toNumOrNull(formData.annual_taxes),
      };
      const { error } = await supabase.from("leads").update(updateData).eq("id", id!);
      if (error) throw error;

      // If the address changed, sync the matching inspection record so worksheet & market analysis stay linked
      if (user && oldAddress && newAddress && oldAddress !== newAddress) {
        const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const oldWords = normalize(oldAddress);
        if (oldWords.length > 0) {
          const oldStreetNum = oldWords[0];
          const shortPattern = oldWords.length > 1 ? `%${oldStreetNum}%${oldWords[1]}%` : `%${oldStreetNum}%`;

          const { data: inspections } = await supabase
            .from("inspections")
            .select("id, property_address")
            .eq("user_id", user.id)
            .ilike("property_address", shortPattern)
            .order("updated_at", { ascending: false })
            .limit(5);

          if (inspections && inspections.length > 0) {
            const match = inspections.find(r => {
              const dbNum = r.property_address?.match(/\d+/)?.[0];
              return dbNum === oldStreetNum;
            });
            if (match) {
              await supabase.from("inspections").update({ property_address: newAddress }).eq("id", match.id);
            }
          }
        }
      }
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

  // Manual "Refresh from Estated" — only runs when user explicitly clicks it
  const refreshFromEstated = async () => {
    if (!id) return;
    if (!formData.address?.trim()) {
      toast({ title: "Add a property address first", variant: "destructive" });
      return;
    }
    setRefreshingEstated(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-property", {
        body: {
          address: formData.address,
          city: formData.city,
          state: formData.state || "OH",
          zip: formData.zip,
        },
      });
      if (error || !data || data.error) {
        throw new Error(error?.message || data?.error || "Lookup failed");
      }
      const toN = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const cache = {
        bedrooms: toN(data.bedrooms),
        bathrooms: toN(data.bathrooms),
        square_feet: toN(data.sqft),
        year_built: toN(data.year_built),
        lot_size_sqft: toN(data.lot_size_sqft),
        annual_taxes: toN(data.annual_amount),
        assessed_value: toN(data.assessed_value),
        market_value: toN(data.market_value),
        owner_name: data.owner_name || null,
        property_type: data.property_type || null,
        estated_data: data.raw || data,
        estated_fetched_at: new Date().toISOString(),
      };
      const { error: upErr } = await supabase.from("leads").update(cache).eq("id", id);
      if (upErr) throw upErr;
      // Update local form fields too
      setFormData((prev) => ({
        ...prev,
        bedrooms: cache.bedrooms != null ? String(cache.bedrooms) : prev.bedrooms,
        bathrooms: cache.bathrooms != null ? String(cache.bathrooms) : prev.bathrooms,
        square_feet: cache.square_feet != null ? String(cache.square_feet) : prev.square_feet,
        year_built: cache.year_built != null ? String(cache.year_built) : prev.year_built,
        annual_taxes: cache.annual_taxes != null ? String(cache.annual_taxes) : prev.annual_taxes,
      }));
      queryClient.invalidateQueries({ queryKey: ["lead", id] });
      toast({ title: "Property data refreshed from public records" });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e.message, variant: "destructive" });
    } finally {
      setRefreshingEstated(false);
    }
  };


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

  const convertToClient = async () => {
    if (!lead || !user) return;
    setIsConverting(true);
    try {
      // Split address into street_number and street_name
      const addressParts = (formData.address || "").trim().split(/\s+/);
      const streetNumber = addressParts.length > 1 ? addressParts[0] : null;
      const streetName = addressParts.length > 1 ? addressParts.slice(1).join(" ") : formData.address || null;

      // Insert into clients table
      const { data: newClient, error: insertError } = await supabase
        .from("clients")
        .insert({
          agent_id: user.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email || null,
          cell_phone: formData.phone || null,
          street_number: streetNumber,
          street_name: streetName,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          notes: formData.notes || null,
          status: "A",
          mls_description: lead.mls_description || null,
          mls_description_claude: lead.mls_description_claude || null,
          mls_description_final: lead.mls_description_final || null,
          mls_description_notes: (lead as any).mls_description_notes || null,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      // Delete the original seller lead now that it's been converted to a client.
      const { error: deleteError } = await supabase
        .from("leads")
        .delete()
        .eq("id", lead.id)
        .eq("agent_id", user.id);
      if (deleteError) throw deleteError;

      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Lead converted to client successfully" });
      navigate(`/dashboard?tab=clients&openClient=${newClient.id}`);
    } catch (error: any) {
      toast({ title: "Error converting lead", description: error.message, variant: "destructive" });
    } finally {
      setIsConverting(false);
      setShowConvertDialog(false);
    }
  };

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
    { id: "mls-description", label: "Write MLS Description", icon: Pencil },
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
            onClick={() => {
              if (activeTab !== "details") {
                setActiveTab("details");
              } else {
                navigate("/dashboard?tab=leads");
              }
            }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-left text-muted-foreground hover:bg-muted hover:text-foreground border-b border-border transition-colors"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            {activeTab !== "details" ? "Back to Lead Details" : "Back to Leads"}
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
            <LeadEstimatedNet lead={lead} onBack={() => setActiveTab("details")} />
          </div>
        ) : activeTab === "residential" && lead ? (
          <div className="flex-1 overflow-auto p-6">
            <ResidentialWorkSheetTab lead={lead} />
          </div>
        ) : activeTab === "mls-description" && lead ? (
          <div className="flex-1 overflow-auto p-6">
            <MLSDescriptionTab
              leadId={lead.id}
              initialDescription={(lead as any).mls_description}
              initialClaude={(lead as any).mls_description_claude}
              initialFinal={(lead as any).mls_description_final}
              initialNotes={(lead as any).mls_description_notes}
            />
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
                    {lead && (
                      <Button variant="default" size="sm" onClick={() => setShowConvertDialog(true)}>
                        <UserCheck className="w-4 h-4 mr-1" />
                        Convert to Client
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="address">Property Address</Label>
                      <Input
                        id="address"
                        placeholder="Enter street address"
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      />
                    </div>

                    {/* Cached property data — pulled once at lead creation, editable here, reused by all tabs */}
                    <div className="rounded-md border border-border/60 bg-muted/30 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">Property Data (cached)</h4>
                          <p className="text-xs text-muted-foreground">
                            Used by Residential Work Sheet, Estimated Net & Market Analysis. No re-lookup unless you click Refresh.
                            {(lead as any)?.estated_fetched_at && (
                              <> Last refreshed: {new Date((lead as any).estated_fetched_at).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={refreshFromEstated} disabled={refreshingEstated}>
                          {refreshingEstated ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          Refresh from Estated
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="bedrooms" className="text-xs">Bedrooms</Label>
                          <Input id="bedrooms" inputMode="numeric" value={formData.bedrooms} onChange={(e) => setFormData({ ...formData, bedrooms: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="bathrooms" className="text-xs">Bathrooms</Label>
                          <Input id="bathrooms" inputMode="decimal" value={formData.bathrooms} onChange={(e) => setFormData({ ...formData, bathrooms: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="square_feet" className="text-xs">Square Feet</Label>
                          <Input id="square_feet" inputMode="numeric" value={formData.square_feet} onChange={(e) => setFormData({ ...formData, square_feet: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="year_built" className="text-xs">Year Built</Label>
                          <Input id="year_built" inputMode="numeric" value={formData.year_built} onChange={(e) => setFormData({ ...formData, year_built: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="annual_taxes" className="text-xs">Annual Taxes</Label>
                          <Input id="annual_taxes" inputMode="decimal" value={formData.annual_taxes} onChange={(e) => setFormData({ ...formData, annual_taxes: e.target.value })} />
                        </div>
                      </div>
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
                        <div className="relative">
                          <Input
                            id="email"
                            type="text"
                            placeholder="email@example.com, email2@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="pr-10"
                          />
                          {formData.email && (
                            <button
                              type="button"
                              onClick={() => openEmailClient(formData.email.split(",")[0].trim())}
                              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-md text-primary hover:bg-accent transition-colors"
                              title="Send email"
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <div className="relative">
                          <Input
                            id="phone"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="pr-16"
                          />
                          {formData.phone && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                              <PhoneCallTextLink phone={formData.phone} inline>{""}</PhoneCallTextLink>
                            </div>
                          )}
                        </div>
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

            {activeTab === "market-analysis" && lead && (
              <MarketAnalysisTab lead={lead} />
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

      <AlertDialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert Lead to Client</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new active client from <strong>{formData.first_name} {formData.last_name}</strong> and permanently delete this seller lead. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="text-sm space-y-1 py-2 text-muted-foreground">
            <p><strong>Name:</strong> {formData.first_name} {formData.last_name}</p>
            {formData.address && <p><strong>Address:</strong> {formData.address}</p>}
            {formData.city && <p><strong>City:</strong> {formData.city}, {formData.state} {formData.zip}</p>}
            {formData.email && <p><strong>Email:</strong> {formData.email}</p>}
            {formData.phone && <p><strong>Phone:</strong> {formData.phone}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isConverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={convertToClient} disabled={isConverting}>
              {isConverting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
              Convert to Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SellerLeadDetail;
