import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailForAnalysis {
  id: string;
  subject: string | null;
  snippet: string | null;
  body_preview: string | null;
  direction: string;
  from_email: string;
  to_email: string;
  received_at: string;
  client_name: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Unauthorized: Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Authentication error:', authError);
      throw new Error('Unauthorized: Invalid token');
    }

    console.log('User authenticated:', user.id);

    // Fetch recent emails (last 7 days) with client info
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: emails, error: emailsError } = await supabaseClient
      .from('client_email_logs')
      .select(`
        id,
        subject,
        snippet,
        body_preview,
        direction,
        from_email,
        to_email,
        received_at,
        client_id
      `)
      .eq('agent_id', user.id)
      .gte('received_at', sevenDaysAgo.toISOString())
      .order('received_at', { ascending: false })
      .limit(50);

    if (emailsError) {
      console.error('Error fetching emails:', emailsError);
      throw emailsError;
    }

    // Get unique client IDs
    const clientIds = [...new Set(emails?.map(e => e.client_id).filter(Boolean))];
    
    // Fetch client names
    const { data: clients } = await supabaseClient
      .from('clients')
      .select('id, first_name, last_name')
      .in('id', clientIds);

    const clientNameMap = new Map(
      clients?.map(c => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]) || []
    );

    // Fetch existing pending tasks to avoid duplicates
    const { data: existingTasks } = await supabaseClient
      .from('tasks')
      .select('title, description')
      .eq('agent_id', user.id)
      .neq('status', 'completed');

    const existingTaskTitles = new Set(existingTasks?.map(t => t.title.toLowerCase()) || []);

    // Format emails for AI analysis
    const emailsForAnalysis: EmailForAnalysis[] = (emails || []).map(email => ({
      id: email.id,
      subject: email.subject,
      snippet: email.snippet,
      body_preview: email.body_preview,
      direction: email.direction,
      from_email: email.from_email,
      to_email: email.to_email,
      received_at: email.received_at,
      client_name: email.client_id ? clientNameMap.get(email.client_id) || null : null,
    }));

    if (emailsForAnalysis.length === 0) {
      return new Response(JSON.stringify({ 
        suggestions: [],
        message: "No recent emails to analyze"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Lovable AI for task suggestions
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const today = new Date().toISOString().split('T')[0];
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a real estate agent. Analyze their email communications and suggest actionable tasks they should complete. Focus on:

1. **Follow-up reminders**: Clients who sent emails but may not have received a response, or conversations that need follow-up
2. **Action items from emails**: Specific requests mentioned in emails (documents to send, showings to schedule, questions to answer)
3. **Urgent responses needed**: Time-sensitive matters requiring immediate attention

Today's date is ${today}. Consider email recency when determining priority.

Return ONLY unique, actionable tasks. Do not suggest tasks that are vague or unclear. Each task should be specific and achievable.`
          },
          {
            role: 'user',
            content: `Analyze these recent email communications and suggest up to 5 specific tasks:

${JSON.stringify(emailsForAnalysis, null, 2)}

Existing tasks (avoid duplicates): ${Array.from(existingTaskTitles).join(', ')}

Return JSON in this exact format:
{
  "suggestions": [
    {
      "title": "Brief, action-oriented task title",
      "description": "Specific details about what needs to be done",
      "priority": "urgent" | "high" | "medium" | "low",
      "category": "follow-up" | "action-item" | "urgent-response",
      "relatedClient": "Client name if applicable",
      "reasoning": "Why this task is suggested based on the emails"
    }
  ]
}`
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const result = JSON.parse(aiData.choices[0].message.content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-tasks-from-emails:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      suggestions: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
