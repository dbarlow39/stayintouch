import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ESTATED_API_KEY = Deno.env.get("ESTATED_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { address, city, state, zip } = await req.json();

    if (!ESTATED_API_KEY) {
      throw new Error("ESTATED_API_KEY is not configured");
    }

    if (!address) {
      throw new Error("Address is required");
    }

    // Build combined address
    const combinedAddress = [address, city, state, zip].filter(Boolean).join(", ");

    // Estated Property Lookup API
    const url = new URL("https://apis.estated.com/v4/property");
    url.searchParams.append("token", ESTATED_API_KEY);
    url.searchParams.append("combined_address", combinedAddress);

    console.log("Fetching property data for:", combinedAddress);

    const response = await fetch(url.toString());
    const result = await response.json();

    if (!response.ok) {
      console.error("Estated API error:", result);
      throw new Error(result.error?.message || "Failed to fetch property data");
    }

    console.log("Estated API response:", JSON.stringify(result, null, 2));
    console.log("Owner data:", JSON.stringify(result.data?.owner, null, 2));

    // Extract tax, address, and owner information from the response
    const owner = result.data?.owner || {};
    const ownerName = owner.name || '';
    const secondOwnerName = owner.second_name || '';
    const combinedOwnerName = [ownerName, secondOwnerName].filter(Boolean).join(' & ');

    const structure = result.data?.structure || {};

    const parcel = result.data?.parcel || {};

    const propertyResult = {
      annual_amount: result.data?.taxes?.[0]?.amount || 0,
      tax_year: result.data?.taxes?.[0]?.year || new Date().getFullYear(),
      assessed_value: result.data?.assessments?.[0]?.assessed_value || 0,
      market_value: result.data?.assessments?.[0]?.market_value || 0,
      city: result.data?.address?.city || "",
      state: result.data?.address?.state || "",
      zip: result.data?.address?.zip_code || "",
      owner_name: combinedOwnerName,
      bedrooms: structure.beds_count || "",
      bathrooms: structure.baths || "",
      sqft: structure.total_area_sq_ft || "",
      year_built: structure.year_built || "",
      stories: structure.stories || "",
      lot_size_sqft: parcel.area_sq_ft || result.data?.parcel?.area_sq_ft || "",
      property_type: structure.units_count ? `${structure.units_count}-unit` : (parcel.standardized_land_use_category || ""),
      // Full raw response so callers can cache and reuse without re-calling Estated
      raw: result.data || null,
    };

    return new Response(JSON.stringify(propertyResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Error in lookup-property:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
