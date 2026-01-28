import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailForAnalysis {
  id: string;
  gmail_message_id: string | null;
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

    // Fetch existing pending suggested tasks to avoid duplicates
    const { data: existingSuggestions } = await supabaseClient
      .from('suggested_tasks')
      .select('title')
      .eq('agent_id', user.id)
      .eq('status', 'pending');

    const existingSuggestionTitles = new Set(
      existingSuggestions?.map(s => s.title.toLowerCase()) || []
    );

    // Fetch recent emails (last 7 days) with client info
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: emails, error: emailsError } = await supabaseClient
      .from('client_email_logs')
      .select(`
        id,
        gmail_message_id,
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
      .limit(100);

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
    
    // Combine all existing titles to avoid duplicates
    const allExistingTitles = new Set([...existingTaskTitles, ...existingSuggestionTitles]);

    // Create a map of email IDs for quick lookup
    const emailMap = new Map(
      (emails || []).map(e => [e.id, { gmail_message_id: e.gmail_message_id }])
    );

    // Format emails for AI analysis
    const emailsForAnalysis: EmailForAnalysis[] = (emails || []).map(email => ({
      id: email.id,
      gmail_message_id: email.gmail_message_id,
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
        newSuggestionsCount: 0,
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
            content: `You are an AI assistant for a real estate agent. Analyze their email communications thoroughly and suggest actionable tasks they should complete. Be aggressive in finding tasks - it's better to suggest more than fewer.

Focus on these categories:

1. **Follow-up reminders**: 
   - Incoming emails without a clear outgoing response within 24-48 hours
   - Conversations that seem incomplete or need continuation
   - Clients who asked questions that may not have been fully answered

2. **Action items from emails**: 
   - Specific requests mentioned in emails (documents to send, showings to schedule, questions to answer)
   - Commitments the agent made that need tracking
   - Tasks delegated by clients or mentioned as needed

3. **Urgent responses needed**: 
   - Time-sensitive matters (offers, deadlines, showings)
   - Emails marked with urgency or containing urgent language
   - Recent unanswered incoming emails (within last 48 hours)

4. **Proactive outreach**:
   - Clients who haven't been contacted recently
   - Follow-ups on previous discussions that may have stalled

DEPRIORITIZE RULES (mark as "low" priority or skip entirely):
- Voicemail transcription failures: Emails containing "We're sorry. We were unable to transcribe this message. Please check your voicemail." should NOT be urgent - these are routine voicemail notifications, not actionable items.
- Automated system notifications that don't require a response.

Today's date is ${today}. Prioritize based on recency and urgency.

IMPORTANT: Return at least 3-8 actionable tasks. Be specific and include client names when possible. Each task should be something the agent can act on immediately.`
          },
          {
            role: 'user',
            content: `Analyze these email communications from the last 7 days and suggest 5-8 specific, actionable tasks:

${JSON.stringify(emailsForAnalysis, null, 2)}

Existing tasks/suggestions to avoid duplicating: ${Array.from(allExistingTitles).join(', ')}

Return JSON in this exact format:
{
  "suggestions": [
    {
      "title": "Brief, action-oriented task title (e.g., 'Follow up with John Smith about offer status')",
      "description": "Specific details about what needs to be done and why",
      "priority": "urgent" | "high" | "medium" | "low",
      "category": "follow-up" | "action-item" | "urgent-response" | "proactive-outreach",
      "relatedClient": "Client name if applicable, or null",
      "reasoning": "Brief explanation of why this task is needed based on the email content",
      "sourceEmailId": "The 'id' field of the most relevant email this task relates to, or null if not specific to one email"
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
    
    // Filter out any suggestions that match existing titles
    const newSuggestions = (result.suggestions || []).filter(
      (s: { title: string }) => !allExistingTitles.has(s.title.toLowerCase())
    );

    // Save new suggestions to the database with source email references
    if (newSuggestions.length > 0) {
      const suggestionsToInsert = newSuggestions.map((s: any) => {
        const sourceEmailId = s.sourceEmailId || null;
        const emailInfo = sourceEmailId ? emailMap.get(sourceEmailId) : null;
        
        return {
          agent_id: user.id,
          title: s.title,
          description: s.description,
          priority: s.priority,
          category: s.category,
          related_client: s.relatedClient,
          reasoning: s.reasoning,
          status: 'pending',
          source_email_id: sourceEmailId,
          gmail_message_id: emailInfo?.gmail_message_id || null,
        };
      });

      const { error: insertError } = await supabaseClient
        .from('suggested_tasks')
        .insert(suggestionsToInsert);

      if (insertError) {
        console.error('Error inserting suggestions:', insertError);
      } else {
        console.log(`Inserted ${newSuggestions.length} new suggestions`);
      }
    }

    return new Response(JSON.stringify({ 
      newSuggestionsCount: newSuggestions.length,
      message: newSuggestions.length > 0 
        ? `Added ${newSuggestions.length} new suggestions` 
        : 'No new suggestions found'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-tasks-from-emails:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      newSuggestionsCount: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});