import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { GooglePlacesAddressInput } from "@/components/dashboard/residential/GooglePlacesAddressInput";

const titleCase = (s: string) =>
  s
    ? s
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
    : "";

const toNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const AddLead = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [googleMapsKey, setGoogleMapsKey] = useState<string>("");
  const [addressInput, setAddressInput] = useState("");
  const [creating, setCreating] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddressSelect = async (fullAddress: string) => {
    if (!user?.id) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }

    // Parse Google address components
    let streetNumber = "";
    let route = "";
    let city = "";
    let state = "OH";
    let zip = "";

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

    const streetAddress =
      [streetNumber, route].filter(Boolean).join(" ").trim() ||
      fullAddress.split(",")[0]?.trim() ||
      fullAddress;

    setCreating(true);

    // Look up Estated property data (best-effort)
    let estated: any = null;
    let ownerFirst = "";
    let ownerLast = "";
    try {
      const { data, error } = await supabase.functions.invoke("lookup-property", {
        body: { address: streetAddress, city, state, zip },
      });
      if (!error && data && !data.error) {
        estated = data;
        if (data.owner_name) {
          const parts = String(data.owner_name).split(" ");
          ownerFirst = titleCase(parts[0] || "");
          ownerLast = titleCase(parts.slice(1).join(" ") || "");
        }
      }
    } catch (err) {
      console.error("Estated lookup error:", err);
    }

    // Insert the new lead
    const insertPayload: any = {
      agent_id: user.id,
      lead_type: "seller",
      status: "new",
      address: streetAddress,
      city: city || titleCase(estated?.city || ""),
      state: state || "OH",
      zip: zip || estated?.zip || "",
      first_name: ownerFirst || "Unknown",
      last_name: ownerLast || "Owner",
      bedrooms: toNum(estated?.bedrooms),
      bathrooms: toNum(estated?.bathrooms),
      square_feet: toNum(estated?.sqft),
      year_built: toNum(estated?.year_built),
      lot_size_sqft: toNum(estated?.lot_size_sqft),
      annual_taxes: toNum(estated?.annual_amount),
      assessed_value: toNum(estated?.assessed_value),
      market_value: toNum(estated?.market_value),
      owner_name: estated?.owner_name || null,
      property_type: estated?.property_type || null,
      estated_data: estated?.raw || estated || null,
      estated_fetched_at: estated ? new Date().toISOString() : null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("leads")
      .insert([insertPayload])
      .select()
      .single();

    if (insertError || !inserted) {
      console.error("Insert lead error:", insertError);
      toast({
        title: "Error creating lead",
        description: insertError?.message || "Unknown error",
        variant: "destructive",
      });
      setCreating(false);
      return;
    }

    toast({ title: "Lead created", description: streetAddress });
    navigate(`/seller-lead/${inserted.id}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Add New Seller Lead
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Search for the property address. Once you select an address, the lead
              will be created and you'll be taken to the lead details page.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address" className="flex items-center gap-2">
                Property Address
                {creating && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </Label>
              {googleMapsKey ? (
                <GooglePlacesAddressInput
                  id="address"
                  apiKey={googleMapsKey}
                  value={addressInput}
                  onChange={setAddressInput}
                  onAddressSelect={handleAddressSelect}
                />
              ) : (
                <Input
                  id="address"
                  placeholder="Loading address autocomplete..."
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  disabled
                />
              )}
              {creating && (
                <p className="text-xs text-muted-foreground">
                  Looking up property details and creating lead...
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AddLead;
