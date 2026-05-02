import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserPlus, Trash2, Phone, Mail, Asterisk, Zap, Users, Settings2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import SequenceManager from "./SequenceManager";
import LeadEnrollmentDialog from "./LeadEnrollmentDialog";
import { GooglePlacesAddressInput } from "./residential/GooglePlacesAddressInput";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  address: string | null;
  created_at: string;
}

const statusColors = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-accent/10 text-accent-foreground border-accent/20",
  qualified: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  unqualified: "bg-destructive/10 text-destructive border-destructive/20",
  nurturing: "bg-secondary/50 text-secondary-foreground border-border",
};

const titleCase = (s: string) =>
  s
    ? s
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    : "";

// Estated cached fields kept alongside the lead form
type EstatedCache = {
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  year_built: number | null;
  lot_size_sqft: number | null;
  annual_taxes: number | null;
  assessed_value: number | null;
  market_value: number | null;
  owner_name: string | null;
  property_type: string | null;
  estated_data: any | null;
  estated_fetched_at: string | null;
};

const emptyEstated: EstatedCache = {
  bedrooms: null,
  bathrooms: null,
  square_feet: null,
  year_built: null,
  lot_size_sqft: null,
  annual_taxes: null,
  assessed_value: null,
  market_value: null,
  owner_name: null,
  property_type: null,
  estated_data: null,
  estated_fetched_at: null,
};

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const LeadsTab = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [lookingUpAddress, setLookingUpAddress] = useState(false);
  const [googleMapsKey, setGoogleMapsKey] = useState<string>("");
  const [estatedCache, setEstatedCache] = useState<EstatedCache>(emptyEstated);
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

  // Fetch Google Maps API key once when component mounts (so dialog opens fast)
  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke("get-google-maps-key").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch Google Maps key:", error);
        return;
      }
      if (data?.apiKey) setGoogleMapsKey(data.apiKey);
    });
    return () => { cancelled = true; };
  }, []);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("lead_type", "seller")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (newLead: typeof formData) => {
      const insertPayload: any = {
        ...newLead,
        agent_id: user?.id,
        status: newLead.status as "new" | "contacted" | "qualified" | "unqualified" | "nurturing",
        // Estated cache (one-time pull, reused everywhere)
        bedrooms: estatedCache.bedrooms,
        bathrooms: estatedCache.bathrooms,
        square_feet: estatedCache.square_feet,
        year_built: estatedCache.year_built,
        lot_size_sqft: estatedCache.lot_size_sqft,
        annual_taxes: estatedCache.annual_taxes,
        assessed_value: estatedCache.assessed_value,
        market_value: estatedCache.market_value,
        owner_name: estatedCache.owner_name,
        property_type: estatedCache.property_type,
        estated_data: estatedCache.estated_data,
        estated_fetched_at: estatedCache.estated_fetched_at,
      };
      const { data, error } = await supabase
        .from("leads")
        .insert([insertPayload])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead created successfully" });
      resetForm();
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error creating lead", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast({ title: "Lead deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error deleting lead", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
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
    setEstatedCache(emptyEstated);
  };

  // Handle Google Places selection: parse components, then call Estated ONCE and cache everything
  const handleGooglePlaceSelect = async (fullAddress: string) => {
    // Parse Google address_components from the most recent place_changed event
    let streetNumber = "";
    let route = "";
    let city = "";
    let state = "";
    let zip = "";

    // Pull components from the Google Place sitting on window (set by GooglePlacesAddressInput)
    // Fallback: parse from formatted_address if components unavailable
    const w = window as any;
    const place = w.__lastGooglePlace;
    if (place?.address_components) {
      for (const c of place.address_components) {
        const types: string[] = c.types || [];
        if (types.includes("street_number")) streetNumber = c.long_name;
        else if (types.includes("route")) route = c.long_name;
        else if (types.includes("locality")) city = c.long_name;
        else if (!city && types.includes("sublocality")) city = c.long_name;
        else if (types.includes("administrative_area_level_1")) state = c.short_name;
        else if (types.includes("postal_code")) zip = c.long_name;
      }
    }

    const streetAddress = [streetNumber, route].filter(Boolean).join(" ").trim() || fullAddress.split(",")[0]?.trim() || fullAddress;

    setFormData((prev) => ({
      ...prev,
      address: streetAddress,
      city: city || prev.city,
      state: state || prev.state,
      zip: zip || prev.zip,
    }));

    // Now call Estated ONE time with the parsed pieces
    setLookingUpAddress(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-property", {
        body: { address: streetAddress, city, state: state || "OH", zip },
      });

      if (error || !data || data.error) {
        console.error("Estated lookup error:", error || data?.error);
        toast({
          title: "Address found",
          description: "Property details from public records weren't available for this address.",
        });
        return;
      }

      // Cache everything we got back
      const cache: EstatedCache = {
        bedrooms: toNum(data.bedrooms),
        bathrooms: toNum(data.bathrooms),
        square_feet: toNum(data.sqft),
        year_built: toNum(data.year_built),
        lot_size_sqft: toNum(data.lot_size_sqft),
        annual_taxes: toNum(data.annual_amount),
        assessed_value: toNum(data.assessed_value),
        market_value: toNum(data.market_value),
        owner_name: data.owner_name || null,
        property_type: data.property_type || null,
        estated_data: data.raw || data,
        estated_fetched_at: new Date().toISOString(),
      };
      setEstatedCache(cache);

      // Auto-fill owner name into first/last if blank
      if (data.owner_name) {
        const parts = String(data.owner_name).split(" ");
        const fn = parts[0] || "";
        const ln = parts.slice(1).join(" ") || "";
        setFormData((prev) => ({
          ...prev,
          first_name: prev.first_name || titleCase(fn),
          last_name: prev.last_name || titleCase(ln),
          // Backfill city/zip from Estated if Google missed them
          city: prev.city || titleCase(data.city || ""),
          zip: prev.zip || data.zip || "",
        }));
      }

      toast({ title: "Property details loaded", description: "Owner & property data cached for all tabs." });
    } catch (err: any) {
      console.error("Estated lookup error:", err);
    } finally {
      setLookingUpAddress(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const [innerTab, setInnerTab] = useState("lead-list");

  return (
    <Tabs value={innerTab} onValueChange={setInnerTab} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => setInnerTab("lead-list")}
            className="text-left hover:opacity-80 transition-opacity"
          >
            <h3 className="text-lg font-semibold">Seller Lead CRM</h3>
            <p className="text-sm text-muted-foreground">Track seller leads with automated follow-ups</p>
          </button>
        </div>
        <TabsList>
          <TabsTrigger value="lead-list">
            <Users className="w-4 h-4 mr-2" />
            Seller Leads
          </TabsTrigger>
          <TabsTrigger value="lead-sequences">
            <Settings2 className="w-4 h-4 mr-2" />
            Sequences
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="lead-list" className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => navigate("/leads/new")}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add Lead
          </Button>
        </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading leads...</div>
      ) : !leads || leads.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <UserPlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No leads yet. Add your first lead to get started.</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Sequences</TableHead>
                 <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/seller-lead/${lead.id}`)}>
                  <TableCell className="font-medium">
                    {lead.first_name} {lead.last_name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[lead.address, (lead as any).city, (lead as any).state, (lead as any).zip]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {lead.email && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {lead.email}
                        </div>
                      )}
                      {lead.phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          {lead.phone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
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
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete lead ${lead.first_name} ${lead.last_name}?`)) {
                          deleteMutation.mutate(lead.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      </TabsContent>

      <TabsContent value="lead-sequences">
        <SequenceManager />
      </TabsContent>
    </Tabs>
  );
};

export default LeadsTab;
