import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Unauthorized: Missing authorization header');
    }

    // Extract the JWT token from the Authorization header
    const token = authHeader.replace('Bearer ', '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { 
        global: { 
          headers: { Authorization: authHeader } 
        } 
      }
    );

    // Validate the user token
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      throw new Error('Unauthorized: Invalid token');
    }
    
    const userId = user.id;
    console.log('User authenticated:', userId);

    // Fetch agent's data
    const [
      { data: leads },
      { data: deals },
      { data: tasks },
      { data: clients }
    ] = await Promise.all([
      supabaseClient.from('leads').select('*').eq('agent_id', userId).limit(20),
      supabaseClient.from('deals').select('*').eq('agent_id', userId).limit(20),
      supabaseClient.from('tasks').select('*').eq('agent_id', userId).limit(20),
      supabaseClient.from('clients').select('*').eq('agent_id', userId).limit(20)
    ]);

    // Call Lovable AI for recommendations
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant providing next-best-action recommendations for real estate agents. Analyze their pipeline and suggest 5 specific, actionable next steps prioritized by impact.'
          },
          {
            role: 'user',
            content: `Based on this data: Leads: ${JSON.stringify(leads)}, Deals: ${JSON.stringify(deals)}, Tasks: ${JSON.stringify(tasks)}, Clients: ${JSON.stringify(clients)}. Return JSON: { "recommendations": [{ "action": string, "priority": "high"|"medium"|"low", "reasoning": string, "relatedTo": string, "estimatedImpact": string }] }`
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
    console.error('Error in ai-recommendations:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});