import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailForAnalysis {
  id: string;
  gmail_message_id: string | null;
  thread_id: string | null;
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
  
  // EXCLUDE: ShowingTime emails - ONLY include FEEDBACK
  if (from.includes('showingtime.com') || from.includes('showing.com')) {
    const feedbackKeywords = ['feedback received'];
    // Only keep feedback emails
    if (!feedbackKeywords.some(keyword => subject.includes(keyword))) {
      return false; // Skip all non-feedback ShowingTime emails
    }
  }
  
  // EXCLUDE: Call notification emails (unless from known client)
  if (subject.includes('call summary') || subject.includes('missed call') || 
      subject.includes('voicemail') || subject.includes('new call')) {
    const fromEmail = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1] || '';
    if (!clientEmails.has(fromEmail)) {
      return false; // Skip call notifications unless from known client
    }
  }
  
  // INCLUDE: Emails from known clients (HIGH PRIORITY)
  const fromEmail = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1] || '';
  if (clientEmails.has(fromEmail)) {
    return true;
  }
  
  // INCLUDE: Real estate related emails
  const realEstateKeywords = ['showing', 'offer', 'contract', 'inspection', 'closing',
    'dotloop', 'docusign', 'mls', 'listing', 'buyer', 'seller', 'property',
    'feedback', 'home', 'house', 'real estate', 'mortgage', 'lender',
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

function areTasksAboutSameTopic(task1: string, task2: string): boolean {
  // Extract key entities (names, addresses, properties)
  const extractEntities = (str: string) => {
    const entities = new Set<string>();
    
    // Extract addresses
    const addressMatch = str.match(/\d+\s+[A-Za-z\s]+(?:Dr|Drive|St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place)/gi);
    if (addressMatch) addressMatch.forEach(a => entities.add(a.toLowerCase().trim()));
    
    // Extract phone numbers (10-11 digits)
    const phoneMatch = str.match(/\+?\d{10,11}/g);
    if (phoneMatch) phoneMatch.forEach(p => entities.add(p));
    
    // Extract MLS IDs (8-10 digit numbers)
    const mlsMatch = str.match(/\b\d{8,10}\b/g);
    if (mlsMatch) mlsMatch.forEach(m => entities.add(m));
    
    // Extract dollar amounts
    const dollarMatch = str.match(/\$[\d,]{3,}/g);
    if (dollarMatch) dollarMatch.forEach(d => entities.add(d.replace(/,/g, '')));
    
    // Extract proper names (two capitalized words together)
    const nameMatch = str.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g);
    if (nameMatch) nameMatch.forEach(n => entities.add(n.toLowerCase()));
    
    return entities;
  };
  
  const entities1 = extractEntities(task1);
  const entities2 = extractEntities(task2);
  
  // If they share ANY entity (address, phone, MLS ID, price, name), they're about the same thing
  for (const entity of entities1) {
    if (entities2.has(entity)) {
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
      thread_id,
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

  const emailMap = new Map<string, { gmail_message_id: string | null; thread_id: string | null }>(
    (emails || []).map((e: any) => [e.id, { gmail_message_id: e.gmail_message_id, thread_id: e.thread_id }])
  );

  // First filter for relevant emails
  const relevantEmails: EmailForAnalysis[] = (emails || [])
    .map((email: any) => ({
      id: email.id,
      gmail_message_id: email.gmail_message_id,
      thread_id: email.thread_id,
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

  console.log(`Agent ${agentId}: Filtered to ${relevantEmails.length} relevant emails from ${emails?.length || 0} total`);

  // Group emails by thread_id to avoid duplicate tasks for same conversation
  const emailsByThread = new Map<string, EmailForAnalysis[]>();
  relevantEmails.forEach(email => {
    const threadId = email.thread_id || email.id;
    if (!emailsByThread.has(threadId)) {
      emailsByThread.set(threadId, []);
    }
    emailsByThread.get(threadId)!.push(email);
  });

  // Only analyze the MOST RECENT email from each thread
  const uniqueEmails = Array.from(emailsByThread.values()).map(thread => {
    // Sort by received_at descending, take the first (most recent)
    return thread.sort((a, b) => 
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    )[0];
  });

  console.log(`Agent ${agentId}: Reduced ${relevantEmails.length} emails to ${uniqueEmails.length} unique threads`);

  if (uniqueEmails.length === 0) {
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
          content: `You are an AI assistant for a real estate agent. Be EXTREMELY selective - only suggest tasks for HIGH-PRIORITY, URGENT matters.

**CRITICAL: Only suggest 2-3 tasks MAXIMUM per analysis**

**ONLY CREATE TASKS FOR:**
1. UNANSWERED client questions from known clients (high priority)
2. ShowingTime FEEDBACK that needs to be shared with sellers (high priority)
3. Offers, contracts, or closing deadlines requiring immediate action (urgent)
4. Document signatures needed within 48 hours (urgent)

**NEVER CREATE TASKS FOR:**
- ShowingTime showing confirmations (already scheduled, no action needed)
- Internal email conversations (threads with >3 back-and-forth replies)
- FYI/informational emails
- Emails where the agent has already responded
- Call notifications or voicemails (handle separately)
- Routine coordination emails
- Emails where no response is expected
- Marketing or promotional emails
- System notifications

**TASK QUALITY RULES:**
- If an email thread has multiple messages, only create ONE task for the entire conversation
- If multiple emails are about the same topic, create ONE consolidated task
- Never create duplicate tasks with slightly different wording
- Default to NO TASK unless action is clearly urgent and time-sensitive

Focus on URGENT matters only. Quality over quantity.

Today's date is ${today}.`
        },
        {
          role: 'user',
          content: `Analyze these email communications and suggest 2-3 MAXIMUM specific, urgent, actionable tasks:

${JSON.stringify(uniqueEmails, null, 2)}

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
  
  // Filter duplicates with improved detection
  const filteredSuggestions = (result.suggestions || []).filter(
    (s: { title: string; sourceEmailId?: string | null }) => {
      // Check exact match
      if (allExistingTitles.has(s.title.toLowerCase())) {
        console.log(`Skipping exact duplicate: "${s.title}"`);
        return false;
      }
      
      // Check fuzzy similarity
      if (isSimilarTask(s.title, allExistingTitles)) {
        console.log(`Skipping similar task: "${s.title}"`);
        return false;
      }
      
      // Check if about same topic (same address/phone/price/name)
      for (const existing of allExistingTitles) {
        if (areTasksAboutSameTopic(s.title, existing)) {
          console.log(`Skipping duplicate topic: "${s.title}" similar to "${existing}"`);
          return false;
        }
      }
      
      // Check gmail_message_id
      if (s.sourceEmailId) {
        const emailInfo = emailMap.get(s.sourceEmailId);
        if (emailInfo?.gmail_message_id && processedGmailMessageIds.has(emailInfo.gmail_message_id)) {
          console.log(`Skipping already processed email: "${s.title}"`);
          return false;
        }
      }
      
      return true;
    }
  );

  // Limit to top 3 by priority
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const finalSuggestions = filteredSuggestions
    .sort((a: any, b: any) => {
      return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
    })
    .slice(0, 3); // MAXIMUM 3 tasks

  console.log(`Agent ${agentId}: Final suggestions: ${finalSuggestions.length} of ${filteredSuggestions.length} after limiting to top 3`);

  if (finalSuggestions.length > 0) {
    const suggestionsToInsert = finalSuggestions.map((s: any) => {
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
      console.log(`Agent ${agentId}: Inserted ${finalSuggestions.length} new suggestions`);
    }
  }

  return finalSuggestions.length;
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
