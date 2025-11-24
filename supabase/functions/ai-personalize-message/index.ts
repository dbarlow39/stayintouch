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

    const { recipientId, messageType, messageTemplate, context } = await req.json();

    // Fetch recipient data and interaction history
    const { data: recipient } = await supabaseClient
      .from(messageType === 'lead' ? 'leads' : 'clients')
      .select('*')
      .eq('id', recipientId)
      .single();

    const { data: interactions } = await supabaseClient
      .from('analytics_events')
      .select('*')
      .eq(messageType === 'lead' ? 'lead_id' : 'client_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Call Lovable AI for personalization
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
            content: 'You are an AI assistant specializing in personalized real estate communication. Adapt tone, timing, and content based on client behavior and preferences. Be professional yet warm.'
          },
          {
            role: 'user',
            content: `Personalize this message template: "${messageTemplate}". Recipient: ${JSON.stringify(recipient)}. Recent interactions: ${JSON.stringify(interactions)}. Context: ${context}. Return JSON: { "personalizedMessage": string, "suggestedSendTime": string, "tone": string, "personalizationNotes": string }`
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
    console.error('Error in ai-personalize-message:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});