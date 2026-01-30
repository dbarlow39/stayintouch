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

function isRelevantEmail(email: EmailForAnalysis, clientEmails: Set<string>): boolean {
  const from = email.from_email.toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const body = (email.body_preview || '').toLowerCase();
  
  // EXCLUDE: Personal financial emails
  const financialKeywords = ['paypal', 'venmo', 'zelle', 'bank statement', 'credit card', 
    'subscription', 'payment received', 'invoice', 'receipt', 'billing'];
  if (financialKeywords.some(keyword => from.includes(keyword) || subject.includes(keyword))) {
    return false;
  }
  
  // EXCLUDE: Voicemail/phone notifications
  const phoneKeywords = ['voicemail', 'missed call', 'vonage', 'google voice', 'ringcentral'];
  if (phoneKeywords.some(keyword => from.includes(keyword) || subject.includes(keyword))) {
    return false;
  }
  
  // EXCLUDE: Marketing/CE courses
  const marketingKeywords = ['continuing education', 'webinar', 'newsletter', 'ce course',
    'unsubscribe', 'promotional', 'marketing'];
  if (marketingKeywords.some(keyword => subject.includes(keyword) || body.includes(keyword))) {
    return false;
  }
  
  // EXCLUDE: System notifications
  const systemKeywords = ['password reset', 'verify your email', 'calendar reminder', 
    'security alert', 'login attempt'];
  if (systemKeywords.some(keyword => subject.includes(keyword))) {
    return false;
  }
  
  // INCLUDE: Emails from known clients (HIGH PRIORITY)
  const fromEmail = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1] || '';
  if (clientEmails.has(fromEmail)) {
    return true;
  }
  
  // INCLUDE: Real estate related emails
  const realEstateKeywords = ['showing', 'offer', 'contract', 'inspection', 'closing',
    'dotloop', 'docusign', 'mls', 'listing', 'buyer', 'seller', 'property',
    'showingtime', 'feedback', 'home', 'house', 'real estate', 'mortgage', 'lender',
    'title company', 'escrow', 'appraisal'];
  if (realEstateKeywords.some(keyword => from.includes(keyword) || subject.includes(keyword) || body.includes(keyword))) {
    return true;
  }
  
  return false;
}

function isSimilarTask(newTitle: string, existingTitles: Set<string>): boolean {
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const newNormalized = normalize(newTitle);
  
  for (const existing of existingTitles) {
    const existingNormalized = normalize(existing);
    
    // Check if titles are very similar (>70% word overlap)
    const words1 = new Set(newNormalized.split(' '));
    const words2 = new Set(existingNormalized.split(' '));
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.size / union.size;
    
    if (similarity > 0.7) {
      return true;
    }
  }
  
  return false;
}

// Process suggestions for a single agent
async function processAgentSuggestions(agentId: string, supabaseClient: any): Promise<number> {
  console.log(`Processing suggestions for agent: ${agentId}`);
  
  // Fetch existing suggested tasks (pending, dismissed, added) to avoid duplicates
  const { data: existingSuggestions } = await supabaseClient
    .from('suggested_tasks')
    .select('title, gmail_message_id')
    .eq('agent_id', agentId);

  const existingSuggestionTitles = new Set<string>(
    (existingSuggestions || []).map((s: any) => (s.title as string).toLowerCase())
  );
  
  const processedGmailMessageIds = new Set<string>(
    (existingSuggestions || []).map((s: any) => s.gmail_message_id as string).filter(Boolean)
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
    .eq('agent_id', agentId)
    .eq('direction', 'incoming')
    .not('client_id', 'is', null)
    .gte('received_at', sevenDaysAgo.toISOString())
    .order('received_at', { ascending: false })
    .limit(100);

  if (emailsError) {
    console.error('Error fetching emails:', emailsError);
    throw emailsError;
  }

  const clientIds = [...new Set(emails?.map((e: any) => e.client_id).filter(Boolean))];
  
  const { data: clients } = await supabaseClient
    .from('clients')
    .select('id, first_name, last_name, email')
    .in('id', clientIds);

  const clientNameMap = new Map(
    clients?.map((c: any) => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]) || []
  );

  const clientEmails = new Set<string>();
  clients?.forEach((client: any) => {
    if (client.email) {
      const emailList = client.email.split(/[;,]/).map((e: string) => e.trim().toLowerCase());
      emailList.forEach((e: string) => clientEmails.add(e));
    }
  });

  const { data: existingTasks } = await supabaseClient
    .from('tasks')
    .select('title, description')
    .eq('agent_id', agentId)
    .neq('status', 'completed');

  const existingTaskTitles = new Set<string>((existingTasks || []).map((t: any) => (t.title as string).toLowerCase()));
  const allExistingTitles = new Set<string>([...existingTaskTitles, ...existingSuggestionTitles]);

  const emailMap = new Map<string, { gmail_message_id: string | null }>(
    (emails || []).map((e: any) => [e.id, { gmail_message_id: e.gmail_message_id }])
  );

  const emailsForAnalysis: EmailForAnalysis[] = (emails || [])
    .map((email: any) => ({
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
    }))
    .filter((email: EmailForAnalysis) => isRelevantEmail(email, clientEmails));

  console.log(`Agent ${agentId}: Filtered to ${emailsForAnalysis.length} relevant emails from ${emails?.length || 0} total`);

  if (emailsForAnalysis.length === 0) {
    return 0;
  }

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
          content: `You are an AI assistant for a real estate agent. Analyze their email communications and suggest actionable tasks ONLY for client-related real estate matters.

**EMAILS FROM KNOWN CLIENTS (HIGHEST PRIORITY):**
${emailsForAnalysis.filter(e => e.client_name).length} emails in this batch are from known clients in the database. PRIORITIZE THESE FIRST.

**STRICT FILTERING - IGNORE THESE COMPLETELY:**
- Personal financial emails (already filtered, but double-check)
- Voicemail transcription notifications
- Marketing/promotional emails  
- Automated system notifications
- Any email NOT directly related to a real estate transaction

**ONLY SUGGEST TASKS FOR:**
1. Direct communications from known clients (client_name is not null) - HIGHEST PRIORITY
2. Property showings, offers, contracts, inspections, closings
3. ShowingTime feedback that needs follow-up with sellers
4. dotloop/DocuSign documents needing review or signature
5. Communications from other agents about your clients' properties

**Prioritization Rules:**
- Known client emails → urgent or high priority
- ShowingTime feedback for listings → high priority
- Transaction documents (offers, contracts) → urgent priority
- Other real estate communications → medium priority

Focus on these categories:
1. Follow-up reminders for unanswered client emails (24-48 hours)
2. Action items from emails (documents, showings, offers)
3. Urgent responses needed (time-sensitive matters)

Today's date is ${today}. Return 3-6 highly relevant, actionable tasks. Focus on known clients first.`
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
    
    if (aiResponse.status === 429 || aiResponse.status === 402) {
      return 0; // Skip this agent on rate limit/payment issues
    }
    
    throw new Error(`AI Gateway error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const result = JSON.parse(aiData.choices[0].message.content);
  
  const newSuggestions = (result.suggestions || []).filter(
    (s: { title: string; sourceEmailId?: string | null }) => {
      if (allExistingTitles.has(s.title.toLowerCase())) return false;
      if (isSimilarTask(s.title, allExistingTitles)) return false;
      
      if (s.sourceEmailId) {
        const emailInfo = emailMap.get(s.sourceEmailId);
        if (emailInfo?.gmail_message_id && processedGmailMessageIds.has(emailInfo.gmail_message_id)) {
          return false;
        }
      }
      
      return true;
    }
  );

  if (newSuggestions.length > 0) {
    const suggestionsToInsert = newSuggestions.map((s: any) => {
      const sourceEmailId = s.sourceEmailId || null;
      const emailInfo = sourceEmailId ? emailMap.get(sourceEmailId) : null;
      
      return {
        agent_id: agentId,
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
      console.log(`Agent ${agentId}: Inserted ${newSuggestions.length} new suggestions`);
    }
  }

  return newSuggestions.length;
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
    const { process_all_agents } = await req.json().catch(() => ({}));

    // Use service role client for processing all agents
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      process_all_agents 
        ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        : Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    let agentIds: string[] = [];

    if (process_all_agents) {
      // Cron mode: process all agents with Gmail tokens
      console.log('Running in cron mode: processing all agents');
      
      const { data: tokens, error: tokensError } = await supabaseClient
        .from('gmail_oauth_tokens')
        .select('agent_id');
      
      if (tokensError) {
        console.error('Error fetching agent tokens:', tokensError);
        throw tokensError;
      }
      
      agentIds = [...new Set(tokens?.map(t => t.agent_id) || [])];
      console.log(`Found ${agentIds.length} agents with Gmail connected`);
    } else {
      // Manual mode: process single authenticated user
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Authentication error:', authError);
        throw new Error('Unauthorized: Invalid token');
      }
      
      agentIds = [user.id];
      console.log('Running in manual mode for user:', user.id);
    }

    let totalNewSuggestions = 0;

    for (const agentId of agentIds) {
      try {
        const count = await processAgentSuggestions(agentId, supabaseClient);
        totalNewSuggestions += count;
      } catch (error) {
        console.error(`Error processing agent ${agentId}:`, error);
        // Continue with other agents
      }
    }

    return new Response(JSON.stringify({ 
      newSuggestionsCount: totalNewSuggestions,
      agentsProcessed: agentIds.length,
      message: totalNewSuggestions > 0 
        ? `Added ${totalNewSuggestions} new suggestions across ${agentIds.length} agents` 
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