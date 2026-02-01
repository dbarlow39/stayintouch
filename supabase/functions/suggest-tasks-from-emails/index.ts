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

interface TriagedEmail {
  title: string;
  email_summary: string;
  sender: string;
  action_needed: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  triage_category: 'urgent' | 'important' | 'fyi' | 'ignore';
  reasoning: string | null;
  sourceEmailId: string | null;
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
  
  // EXCLUDE: ShowingTime emails - ONLY include FEEDBACK RECEIVED
  // Showing requests, confirmations, and "please provide feedback" requests should be ignored.
  const isShowingTimeSender =
    from.includes('showingtime.com') ||
    from.includes('showing.com') ||
    from.includes('showingtime') ||
    subject.includes('showingtime');

  if (isShowingTimeSender) {
    const feedbackReceivedKeywords = ['feedback received'];
    if (!feedbackReceivedKeywords.some(keyword => subject.includes(keyword))) {
      return false;
    }
  }
  
  // EXCLUDE: Showing request/confirmation emails even if not from ShowingTime domain
  // (These have been creating noisy suggestions like "Confirm showing details".)
  const showingExcludeKeywords = [
    'showing summary',
    'showing request',
    'showing confirmation',
    'appointment confirmed',
    'appointment scheduled',
    'showing scheduled',
    'confirm showing',
    'confirm showing details',
    'showing details',
    'showing instructions',
    'request to show',
    'request showing',
    'collect showing feedback',
    'please provide feedback',
  ];
  if (showingExcludeKeywords.some(keyword => subject.includes(keyword))) {
    return false;
  }
  
  // EXCLUDE: Call notification emails (unless from known client)
  if (subject.includes('call summary') || subject.includes('missed call') || 
      subject.includes('voicemail') || subject.includes('new call')) {
    const fromEmail = from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1] || '';
    if (!clientEmails.has(fromEmail)) {
      return false;
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
  const extractEntities = (str: string) => {
    const entities = new Set<string>();
    
    const addressMatch = str.match(/\d+\s+[A-Za-z\s]+(?:Dr|Drive|St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place)/gi);
    if (addressMatch) addressMatch.forEach(a => entities.add(a.toLowerCase().trim()));
    
    const phoneMatch = str.match(/\+?\d{10,11}/g);
    if (phoneMatch) phoneMatch.forEach(p => entities.add(p));
    
    const mlsMatch = str.match(/\b\d{8,10}\b/g);
    if (mlsMatch) mlsMatch.forEach(m => entities.add(m));
    
    const dollarMatch = str.match(/\$[\d,]{3,}/g);
    if (dollarMatch) dollarMatch.forEach(d => entities.add(d.replace(/,/g, '')));
    
    const nameMatch = str.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g);
    if (nameMatch) nameMatch.forEach(n => entities.add(n.toLowerCase()));
    
    return entities;
  };
  
  const entities1 = extractEntities(task1);
  const entities2 = extractEntities(task2);
  
  for (const entity of entities1) {
    if (entities2.has(entity)) {
      return true;
    }
  }
  
  return false;
}

function isEmailAlreadyProcessed(
  emailId: string, 
  dismissedIds: Set<string>, 
  processedIds: Set<string>
): boolean {
  return dismissedIds.has(emailId) || processedIds.has(emailId);
}

// Process suggestions for a single agent
async function processAgentSuggestions(agentId: string, supabaseClient: any): Promise<{ 
  newSuggestionsCount: number;
  stats: { urgent: number; important: number; fyi: number; ignore: number };
}> {
  console.log(`Processing suggestions for agent: ${agentId}`);
  
  // Fetch existing suggested tasks (BOTH pending AND dismissed) to avoid duplicates
  const { data: existingSuggestions } = await supabaseClient
    .from('suggested_tasks')
    .select('title, gmail_message_id, source_email_id, status')
    .eq('agent_id', agentId)
    .in('status', ['pending', 'dismissed']);

  // Separate pending and dismissed for logging
  const pendingSuggestions = (existingSuggestions || []).filter((s: any) => s.status === 'pending');
  const dismissedSuggestions = (existingSuggestions || []).filter((s: any) => s.status === 'dismissed');
  
  console.log(`Agent ${agentId}: Found ${pendingSuggestions.length} pending, ${dismissedSuggestions.length} dismissed suggestions`);

  // Combine ALL titles (pending + dismissed) to avoid recreating dismissed items
  const existingSuggestionTitles = new Set<string>(
    (existingSuggestions || []).map((s: any) => (s.title as string).toLowerCase())
  );
  
  // Track ALL processed gmail_message_ids (pending + dismissed)
  const processedGmailMessageIds = new Set<string>(
    (existingSuggestions || []).map((s: any) => s.gmail_message_id as string).filter(Boolean)
  );

  // Track ALL processed source_email_ids (pending + dismissed)
  const processedSourceEmailIds = new Set<string>(
    (existingSuggestions || []).map((s: any) => s.source_email_id as string).filter(Boolean)
  );

  // Alias used for email-level filtering to match our source_email_id-based dedupe
  const processedEmailIds = processedSourceEmailIds;

  console.log(
    `Found ${existingSuggestionTitles.size} existing task titles and ${processedEmailIds.size} processed email IDs`
  );
  
  console.log(`Agent ${agentId}: Tracking ${processedGmailMessageIds.size} gmail_message_ids, ${processedSourceEmailIds.size} source_email_ids`);

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

  // Include archived/completed tasks too, so items you marked done don't reappear as new suggestions.
  const { data: existingTasks } = await supabaseClient
    .from('tasks')
    .select('title, description, status, is_archived')
    .eq('agent_id', agentId)
    .limit(500);

  const existingTaskTitles = new Set<string>((existingTasks || []).map((t: any) => (t.title as string).toLowerCase()));
  const allExistingTitles = new Set<string>([...existingTaskTitles, ...existingSuggestionTitles]);

  const emailMap = new Map<string, { gmail_message_id: string | null; thread_id: string | null }>(
    (emails || []).map((e: any) => [e.id, { gmail_message_id: e.gmail_message_id, thread_id: e.thread_id }])
  );

  // Filter out emails that already have tasks (even if dismissed)
  const filteredEmails = (emails || []).filter((email: any) => {
    if (processedEmailIds.has(email.id)) {
      console.log(`Skipping email ${email.id} - already has a task (dismissed or pending)`);
      return false;
    }
    return true;
  });

  console.log(
    `Filtered ${emails?.length || 0} emails down to ${filteredEmails.length} (removed ${processedEmailIds.size} already processed)`
  );

  // CRITICAL: Filter out emails that already have a suggestion (pending OR dismissed)
  // This prevents the AI from generating new suggestions for already-processed emails
  const relevantEmails: EmailForAnalysis[] = filteredEmails
    .filter((email: any) => {
      // Skip if we already have a suggestion for this exact email
      if (processedSourceEmailIds.has(email.id)) {
        console.log(`Skipping email already in suggested_tasks: ${email.subject?.substring(0, 50)}`);
        return false;
      }
      // Skip if we already processed this gmail_message_id
      if (email.gmail_message_id && processedGmailMessageIds.has(email.gmail_message_id)) {
        console.log(`Skipping email with known gmail_message_id: ${email.subject?.substring(0, 50)}`);
        return false;
      }
      return true;
    })
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

  const emailsByThread = new Map<string, EmailForAnalysis[]>();
  relevantEmails.forEach(email => {
    const threadId = email.thread_id || email.id;
    if (!emailsByThread.has(threadId)) {
      emailsByThread.set(threadId, []);
    }
    emailsByThread.get(threadId)!.push(email);
  });

  const uniqueEmails = Array.from(emailsByThread.values()).map(thread => {
    return thread.sort((a, b) => 
      new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    )[0];
  });

  console.log(`Agent ${agentId}: Reduced ${relevantEmails.length} emails to ${uniqueEmails.length} unique threads`);

  if (uniqueEmails.length === 0) {
    return { newSuggestionsCount: 0, stats: { urgent: 0, important: 0, fyi: 0, ignore: 0 } };
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
          content: `You are an intelligent email triage assistant for a real estate agent. Categorize each email into one of four triage categories and create actionable summaries.

**CRITICAL REQUIREMENTS:**
- Every suggestion MUST include the sourceEmailId (the email's 'id' field from the input)
- Each email should generate AT MOST one task - consolidate if needed
- If you cannot determine which email a task relates to, DO NOT create that task

**TRIAGE CATEGORIES:**

1. **URGENT** - Needs immediate attention (within hours)
   - Client questions awaiting response
   - Contract deadlines today/tomorrow
   - Offer responses needed
   - Critical document signatures
   - Inspection issues requiring immediate action

2. **IMPORTANT** - Should handle today
   - Follow-ups needed within 24-48 hours
   - ShowingTime feedback to share with sellers
   - New leads requiring initial contact
   - Scheduling requests
   - Document reviews

3. **FYI** - Informational, no immediate action
   - Showing confirmations (already scheduled)
   - Status updates
   - CC'd emails
   - General announcements
   - Routine coordination

4. **IGNORE** - Can be filtered out
   - Marketing emails
   - Spam
   - Promotional content
   - System notifications
   - Newsletters
   - Auto-responses

**OUTPUT FORMAT:**
For each email, provide EXACTLY ONE entry with:
- title: Brief, action-oriented task (e.g., "Respond to John Smith's counter-offer question")
- email_summary: 1-2 sentence summary of what the email is about
- sender: Name of the sender (extract from email or use client_name)
- action_needed: Clear statement of what the agent should do
- priority: "urgent" | "high" | "medium" | "low"
- triage_category: "urgent" | "important" | "fyi" | "ignore"
- reasoning: Brief explanation of why this categorization
- sourceEmailId: REQUIRED - The email's 'id' field (MUST be an exact match to prevent duplicates)

Today's date is ${today}.`
        },
        {
          role: 'user',
          content: `Analyze and triage these email communications:

${JSON.stringify(uniqueEmails, null, 2)}

Existing tasks/suggestions to avoid duplicating: ${Array.from(allExistingTitles).join(', ')}

IMPORTANT: Every suggestion MUST have a sourceEmailId that exactly matches one of the email 'id' fields above. This is required to prevent duplicates.

Return JSON in this exact format:
{
  "triaged_emails": [
    {
      "title": "Brief, action-oriented task title",
      "email_summary": "1-2 sentence summary of the email content",
      "sender": "Person or company name",
      "action_needed": "What the agent needs to do",
      "priority": "urgent" | "high" | "medium" | "low",
      "triage_category": "urgent" | "important" | "fyi" | "ignore",
      "reasoning": "Why this email was categorized this way",
      "sourceEmailId": "REQUIRED - The exact 'id' field from the email input"
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
      return { newSuggestionsCount: 0, stats: { urgent: 0, important: 0, fyi: 0, ignore: 0 } };
    }
    
    throw new Error(`AI Gateway error: ${aiResponse.status}`);
  }

  const aiData = await aiResponse.json();
  const result = JSON.parse(aiData.choices[0].message.content);
  
  const triagedEmails: TriagedEmail[] = result.triaged_emails || [];
  
  // Track which emails we've already processed in THIS run
  const runProcessedEmailIds = new Set<string>();
  
  // Filter duplicates
  const filteredSuggestions = triagedEmails.filter(
    (s: TriagedEmail) => {
      // If the model didn't return a valid sourceEmailId, skip it.
      if (!s.sourceEmailId || !emailMap.has(s.sourceEmailId)) {
        return false;
      }

      // Skip "ignore" category - don't save these
      if (s.triage_category === 'ignore') {
        return false;
      }

      // Check if email already processed (dismissed or pending)
      if (isEmailAlreadyProcessed(s.sourceEmailId, processedSourceEmailIds, runProcessedEmailIds)) {
        console.log(`Skipping task - email ${s.sourceEmailId} already processed: "${s.title}"`);
        return false;
      }
      
      if (allExistingTitles.has(s.title.toLowerCase())) {
        console.log(`Skipping exact duplicate: "${s.title}"`);
        return false;
      }
      
      if (isSimilarTask(s.title, allExistingTitles)) {
        console.log(`Skipping similar task: "${s.title}"`);
        return false;
      }
      
      for (const existing of allExistingTitles) {
        if (areTasksAboutSameTopic(s.title, existing)) {
          console.log(`Skipping duplicate topic: "${s.title}" similar to "${existing}"`);
          return false;
        }
      }
      
      if (s.sourceEmailId) {
        const emailInfo = emailMap.get(s.sourceEmailId);
        if (emailInfo?.gmail_message_id && processedGmailMessageIds.has(emailInfo.gmail_message_id)) {
          console.log(`Skipping already processed email: "${s.title}"`);
          return false;
        }
      }
      
      // Mark this email as processed in this run
      if (s.sourceEmailId) {
        runProcessedEmailIds.add(s.sourceEmailId);
      }
      
      return true;
    }
  );

  // Count stats (including ignored for reporting)
  const stats = {
    urgent: triagedEmails.filter(e => e.triage_category === 'urgent').length,
    important: triagedEmails.filter(e => e.triage_category === 'important').length,
    fyi: triagedEmails.filter(e => e.triage_category === 'fyi').length,
    ignore: triagedEmails.filter(e => e.triage_category === 'ignore').length,
  };

  console.log(`Agent ${agentId}: Triage stats - Urgent: ${stats.urgent}, Important: ${stats.important}, FYI: ${stats.fyi}, Ignored: ${stats.ignore}`);
  console.log(`Agent ${agentId}: After filtering: ${filteredSuggestions.length} suggestions to insert`);

  if (filteredSuggestions.length > 0) {
    const suggestionsToInsert = filteredSuggestions.map((s: TriagedEmail) => {
      const sourceEmailId = s.sourceEmailId || null;
      const emailInfo = sourceEmailId ? emailMap.get(sourceEmailId) : null;
      
      return {
        agent_id: agentId,
        title: s.title,
        description: s.action_needed,
        email_summary: s.email_summary,
        sender: s.sender,
        action_needed: s.action_needed,
        priority: s.priority,
        triage_category: s.triage_category,
        category: s.triage_category === 'urgent' ? 'urgent-response' : 
                  s.triage_category === 'important' ? 'action-item' : 'follow-up',
        related_client: s.sender,
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
      console.log(`Agent ${agentId}: Inserted ${filteredSuggestions.length} new suggestions`);
    }
  }

  // Clean up old dismissed tasks (older than 30 days) to prevent table bloat
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { error: cleanupError, count: cleanedCount } = await supabaseClient
    .from('suggested_tasks')
    .delete()
    .eq('agent_id', agentId)
    .eq('status', 'dismissed')
    .lt('created_at', thirtyDaysAgo.toISOString());

  if (cleanupError) {
    console.error('Error cleaning up old dismissed tasks:', cleanupError);
  } else if (cleanedCount && cleanedCount > 0) {
    console.log(`Agent ${agentId}: Cleaned up ${cleanedCount} old dismissed tasks`);
  }

  return { newSuggestionsCount: filteredSuggestions.length, stats };
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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      process_all_agents 
        ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
        : Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    let agentIds: string[] = [];

    if (process_all_agents) {
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
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      
      if (authError || !user) {
        console.error('Authentication error:', authError);
        throw new Error('Unauthorized: Invalid token');
      }
      
      agentIds = [user.id];
      console.log('Running in manual mode for user:', user.id);
    }

    let totalNewSuggestions = 0;
    const totalStats = { urgent: 0, important: 0, fyi: 0, ignore: 0 };

    for (const agentId of agentIds) {
      try {
        const { newSuggestionsCount, stats } = await processAgentSuggestions(agentId, supabaseClient);
        totalNewSuggestions += newSuggestionsCount;
        totalStats.urgent += stats.urgent;
        totalStats.important += stats.important;
        totalStats.fyi += stats.fyi;
        totalStats.ignore += stats.ignore;
      } catch (error) {
        console.error(`Error processing agent ${agentId}:`, error);
      }
    }

    return new Response(JSON.stringify({ 
      newSuggestionsCount: totalNewSuggestions,
      agentsProcessed: agentIds.length,
      stats: totalStats,
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
