import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    // Fetch comprehensive analytics data
    const [
      { data: deals },
      { data: leads },
      { data: clients },
      { data: events },
      { data: propertyViews }
    ] = await Promise.all([
      supabaseClient.from('deals').select('*').eq('agent_id', user.id),
      supabaseClient.from('leads').select('*').eq('agent_id', user.id),
      supabaseClient.from('clients').select('*').eq('agent_id', user.id),
      supabaseClient.from('analytics_events').select('*').eq('agent_id', user.id).limit(100),
      supabaseClient.from('property_views').select('*').eq('agent_id', user.id).limit(100)
    ]);

    // Call Lovable AI for predictive analytics
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: 'You are an AI analytics expert for real estate. Analyze historical data to predict client engagement trends, deal closure probabilities, and market opportunities. Provide actionable insights.'
          },
          {
            role: 'user',
            content: `Analyze this data: Deals: ${JSON.stringify(deals)}, Leads: ${JSON.stringify(leads)}, Clients: ${JSON.stringify(clients)}, Events: ${JSON.stringify(events)}, Property Views: ${JSON.stringify(propertyViews)}. Return JSON: { "predictions": { "expectedDealsThisMonth": number, "topEngagedClients": string[], "churnRisk": string[], "marketTrends": string[] }, "insights": [{ "title": string, "description": string, "impact": "high"|"medium"|"low" }] }`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const result = JSON.parse(aiData.choices[0].message.content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-predictive-analytics:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});