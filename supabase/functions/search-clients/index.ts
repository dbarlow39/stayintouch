import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/verifyAuth.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ clients: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the caller's JWT so RLS scopes results to their own clients.
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const q = query.trim().slice(0, 100).replace(/[,%()]/g, " ");
    const searchTerm = `%${q}%`;

    const { data, error } = await supabase
      .from('clients')
      .select('id, first_name, last_name, street_number, street_name, city, state, zip')
      .eq('agent_id', auth.userId)
      .or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},street_name.ilike.${searchTerm},street_number.ilike.${searchTerm},city.ilike.${searchTerm}`)
      .limit(10);

    if (error) {
      console.error('Search error:', error);
      return new Response(
        JSON.stringify({ clients: [], error: 'Search failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const clients = (data || []).map((client: any) => ({
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
    return new Response(
      JSON.stringify({ clients: [], error: 'Unexpected error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
