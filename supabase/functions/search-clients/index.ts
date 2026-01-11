import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ clients: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const searchTerm = `%${query.trim()}%`;
    
    const { data, error } = await supabase
      .from('clients')
      .select('id, first_name, last_name, street_number, street_name, city, state, zip')
      .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},street_name.ilike.${searchTerm},street_number.ilike.${searchTerm},city.ilike.${searchTerm}`)
      .limit(10);

    if (error) {
      console.error('Search error:', error);
      return new Response(
        JSON.stringify({ clients: [], error: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the results
    const clients = (data || []).map(client => ({
      id: client.id,
      name: `${client.first_name || ''} ${client.last_name || ''}`.trim(),
      street_address: `${client.street_number || ''} ${client.street_name || ''}`.trim(),
      city: client.city || '',
      state: client.state || '',
      zip: client.zip || '',
    }));

    return new Response(
      JSON.stringify({ clients }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ clients: [], error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
