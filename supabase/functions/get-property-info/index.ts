import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toProperCase(text: string): string {
  if (!text) return '';
  return text.toLowerCase().split(' ').map(word => {
    const upperWords = ['llc', 'inc', 'corp', 'ltd'];
    if (upperWords.includes(word.toLowerCase())) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { address } = await req.json();
    const estatedApiKey = Deno.env.get('ESTATED_API_KEY');
    if (!estatedApiKey) throw new Error('ESTATED_API_KEY is not configured');
    const response = await fetch(`https://apis.estated.com/v4/property?token=${estatedApiKey}&combined_address=${encodeURIComponent(address)}`);
    if (!response.ok) throw new Error(`Estated API error: ${response.status}`);
    const data = await response.json();
    const propertyData = {
      ownerName: toProperCase(data.data?.owner?.name || ''),
      address: toProperCase(data.data?.address?.formatted_street_address || ''),
      city: toProperCase(data.data?.address?.city || ''),
      zipCode: data.data?.address?.zip_code || '',
      state: data.data?.address?.state || '',
      yearBuilt: data.data?.structure?.year_built || '',
      bedrooms: data.data?.structure?.beds_count || '',
      bathrooms: data.data?.structure?.baths || '',
      sqft: data.data?.structure?.total_area_sq_ft || '',
      stories: data.data?.structure?.stories || '',
    };
    return new Response(JSON.stringify(propertyData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', ownerName: '', address: '', city: '', zipCode: '', state: '', yearBuilt: '', bedrooms: '', bathrooms: '', sqft: '', stories: '' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
