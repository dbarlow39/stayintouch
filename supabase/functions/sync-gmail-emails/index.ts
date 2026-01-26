import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
  };
  internalDate: string;
}

interface ShowingUpdate {
  clientId: string;
  mlsId: string | null;
  address: string | null;
  showingCount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get request body
    const body = await req.json().catch(() => ({}));
    const { agent_id, sync_all_agents = false, max_results = 100, days_back = null } = body;
    
    // Calculate date filter if days_back is provided
    let afterDate: string | null = null;
    if (days_back && typeof days_back === 'number') {
      const date = new Date();
      date.setDate(date.getDate() - days_back);
      afterDate = Math.floor(date.getTime() / 1000).toString(); // Unix timestamp for Gmail API
      console.log(`Filtering emails from last ${days_back} days (after: ${date.toISOString()})`);
    }
    
    // If sync_all_agents is true, sync for all agents with connected Gmail
    let agentIds: string[] = [];
    
    if (sync_all_agents) {
      const { data: tokens } = await supabase
        .from("gmail_oauth_tokens")
        .select("agent_id");
      agentIds = tokens?.map(t => t.agent_id) || [];
      console.log(`Syncing for ${agentIds.length} agents with Gmail connected`);
    } else if (agent_id) {
      agentIds = [agent_id];
    } else {
      return new Response(
        JSON.stringify({ error: "agent_id or sync_all_agents is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allResults: Array<{ agent_id: string; synced_count?: number; showingtime_count?: number; error?: string }> = [];

    for (const currentAgentId of agentIds) {
      try {
        const result = await syncAgentEmails(supabase, currentAgentId, max_results, GOOGLE_CLIENT_ID!, GOOGLE_CLIENT_SECRET!, afterDate);
        allResults.push({ agent_id: currentAgentId, ...result });
      } catch (err) {
        console.error(`Error syncing agent ${currentAgentId}:`, err);
        allResults.push({ agent_id: currentAgentId, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const totalSynced = allResults.reduce((sum, r) => sum + (r.synced_count ?? 0), 0);
    const totalShowingTime = allResults.reduce((sum, r) => sum + (r.showingtime_count ?? 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        agents_processed: agentIds.length,
        synced_count: totalSynced,
        showingtime_count: totalShowingTime,
        message: `Synced ${totalSynced} emails for ${agentIds.length} agent(s)`,
        details: allResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Gmail sync error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function syncAgentEmails(
  supabase: any,
  agent_id: string,
  max_results: number,
  GOOGLE_CLIENT_ID: string,
  GOOGLE_CLIENT_SECRET: string,
  afterDate: string | null = null
) {
  // Get agent's Gmail tokens
  const { data: tokenData, error: tokenError } = await supabase
    .from("gmail_oauth_tokens")
    .select("*")
    .eq("agent_id", agent_id)
    .single();

  if (tokenError || !tokenData) {
    throw new Error("Gmail not connected");
  }

  let accessToken = tokenData.access_token;

  // Check if token is expired and refresh if needed
  if (new Date(tokenData.token_expiry) < new Date()) {
    console.log("Token expired, refreshing...");
    
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const refreshData = await refreshResponse.json();
    
    if (!refreshResponse.ok) {
      console.error("Token refresh failed:", refreshData);
      throw new Error("Failed to refresh Gmail token. Please reconnect Gmail.");
    }

    accessToken = refreshData.access_token;
    const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

    // Update token in database
    await supabase
      .from("gmail_oauth_tokens")
      .update({ access_token: accessToken, token_expiry: newExpiry, updated_at: new Date().toISOString() })
      .eq("agent_id", agent_id);
  }

  // Get client emails and addresses for matching
  const { data: clients } = await supabase
    .from("clients")
    .select("id, email, first_name, last_name, mls_id, street_number, street_name, city, state, zip")
    .eq("agent_id", agent_id);

  console.log(`Querying clients for agent_id: ${agent_id}`);
  console.log(`Query returned ${clients?.length || 0} clients`);

  const clientEmails = new Map(
    clients?.filter((c: any) => c.email).map((c: any) => [c.email!.toLowerCase(), c]) || []
  );

  // Create address-to-client mapping for ShowingTime matching
  const clientAddresses = new Map<string, any>();
  const clientMlsIds = new Map<string, any>();
  clients?.forEach((c: any) => {
    if (c.mls_id) {
      clientMlsIds.set(c.mls_id.toLowerCase().trim(), c);
    }
    if (c.street_number && c.street_name) {
      const addr = `${c.street_number} ${c.street_name}`.toLowerCase().trim();
      clientAddresses.set(addr, c);
    }
  });

  console.log(`Found ${clientEmails.size} clients with emails, ${clientMlsIds.size} with MLS IDs, ${clientAddresses.size} with addresses`);
  console.log(`Sample addresses in map:`, Array.from(clientAddresses.keys()).slice(0, 10));

  // Fetch emails from Gmail
  // Search for emails from/to client addresses OR ShowingTime notifications
  const clientEmailKeys = Array.from(clientEmails.keys()) as string[];
  
  // Add date filter if provided
  const dateFilter = afterDate ? ` after:${afterDate}` : '';
  
  const searchQueries = [
    `from:noreply@showingtime.com${dateFilter}`,
    `from:notifications@showingtime.com${dateFilter}`,
    `subject:showing confirmed${dateFilter}`,
    `subject:showings scheduled${dateFilter}`,
    `subject:feedback${dateFilter}`,
    ...clientEmailKeys.slice(0, 15).map((email) => `(from:${email} OR to:${email})${dateFilter}`)
  ];

  const allMessages: GmailMessage[] = [];
  const showingTimeMessageIds: Set<string> = new Set();

  for (const query of searchQueries.slice(0, 8)) { // Increased from 6 to 8 queries
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max_results}&q=${encodeURIComponent(query)}`;
    
    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error("Gmail list error:", errorText);
      continue;
    }

    const listData = await listResponse.json();
    const messageIds = listData.messages || [];

    const isShowingTimeQuery = query.includes("showingtime") || query.includes("showing");
    
    // Fetch full message details
    for (const msg of messageIds.slice(0, 15)) {
      // For ShowingTime emails, get full body; for others, just metadata
      const format = isShowingTimeQuery ? "full" : "metadata";
      const msgUrl = isShowingTimeQuery
        ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=${format}`
        : `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
      
      const msgResponse = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (msgResponse.ok) {
        const msgData = await msgResponse.json();
        allMessages.push(msgData);
        if (isShowingTimeQuery) {
          showingTimeMessageIds.add(msg.id);
        }
      }
    }
  }

  console.log(`Fetched ${allMessages.length} messages from Gmail (${showingTimeMessageIds.size} ShowingTime)`);

  // Helper to decode base64url email body
  const decodeBody = (msg: GmailMessage): string => {
    try {
      let encoded = msg.payload?.body?.data;
      if (!encoded && msg.payload?.parts) {
        // Prefer text/plain over text/html
        const textPart = msg.payload.parts.find(p => p.mimeType === "text/plain") || 
                         msg.payload.parts.find(p => p.mimeType === "text/html");
        encoded = textPart?.body?.data;
      }
      if (!encoded) return msg.snippet || "";
      const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
      return decoded;
    } catch {
      return msg.snippet || "";
    }
  };

  // Helper to strip HTML tags and decode entities
  const stripHtml = (html: string): string => {
    let result = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style blocks
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script blocks
      .replace(/<[^>]+>/g, ' ') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")  // Handle hex encoded apostrophe
      .replace(/&#x2019;/g, "'")  // Handle smart quote
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
    
    // Remove leading artifact numbers like "96 Feedback Received" -> "Feedback Received"
    result = result.replace(/^\d{1,3}\s+(Feedback|ShowingTime|Sell)/i, '$1');
    // Remove "Sell For One Percent" prefix
    result = result.replace(/^Sell For One Percent\s+/i, '');
    
    return result;
  };

  // Parse ShowingTime email to extract showing count and property info
  const parseShowingTimeEmail = (subject: string, body: string): { 
    address: string | null; 
    mlsId: string | null; 
    showingCount: number | null;
    agentName: string | null;
    agentEmail: string | null;
    agentPhone: string | null;
    feedbackText: string | null;
    showingDate: string | null;
    interestLevel: string | null;
  } => {
    const result = { 
      address: null as string | null, 
      mlsId: null as string | null, 
      showingCount: null as number | null,
      agentName: null as string | null,
      agentEmail: null as string | null,
      agentPhone: null as string | null,
      feedbackText: null as string | null,
      showingDate: null as string | null,
      interestLevel: null as string | null,
    };
    
    // Strip HTML from body before parsing
    const cleanBody = stripHtml(body);
    const combined = `${subject}\n${cleanBody}`;
    
    console.log(`Parsing ShowingTime email. Subject: "${subject.substring(0, 50)}..."`);
    console.log(`Clean body preview: "${cleanBody.substring(0, 300)}..."`);
    
    // NOTE: We no longer try to extract showing count from email body
    // as it's error-prone. Instead, we count SHOWING CONFIRMED emails per client.
    // Keeping showingCount as null here.

    // Look for MLS ID - ShowingTime uses "ID# 123456" format
    // Only match 6-10 digit numeric IDs to avoid tracking parameters
    const mlsPatterns = [
      /\bID[#:\s]+(\d{6,10})\b/i,              // ShowingTime format: "ID# 225026582" (6-10 digits)
      /\bMLS[#:\s]*(\d{6,10})\b/i,             // Standard MLS format with digits only
      /\blisting\s*(?:id|#)[:\s]*(\d{6,10})\b/i,  // "Listing ID: 123456"
    ];
    
    for (const pattern of mlsPatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.mlsId = match[1].trim();
        console.log(`Extracted MLS ID "${result.mlsId}" using pattern: ${pattern}`);
        break;
      }
    }

    // Look for property address
    const addressPatterns = [
      /property[:\s]+(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place)[^,\n]*)/i,
      /address[:\s]+(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place)[^,\n]*)/i,
      /(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place))\s*,/i,
    ];
    
    for (const pattern of addressPatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.address = match[1].trim();
        break;
      }
    }

    // Extract showing agent name - look for "Buyer's Agent Details" section first
    // ShowingTime format appears to be: "Buyer's Agent Details [FirstName] [LastName] [Phone] [Email]"
    const agentNamePatterns = [
      // Match name after "Buyer's Agent Details" - name is typically: FirstName LastName (2-3 capitalized words)
      /Buyer(?:'s)?\s*Agent\s*Details\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s+\(?\d{3}|\s+[a-zA-Z0-9._%+-]+@)/i,
      // Fallback: just look for 2-3 word name after "Details"  
      /\bDetails\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+/i,
      /Buyer(?:'s)?\s*Agent[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /Showing\s*Agent[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    ];
    for (const pattern of agentNamePatterns) {
      const match = combined.match(pattern);
      if (match) {
        let name = match[1].trim();
        // Strip brokerage-related words from the end of the name
        name = name.replace(/\s+(Keller|Williams|Realty|Properties|Real\s*Estate|Brokerage|BHHS|Coldwell|Banker|Century|21|RE\/MAX|ERA)$/i, '').trim();
        // Filter out false positives - should have at least first + last name
        if (name.toLowerCase() !== 'details' && 
            !name.toLowerCase().includes('template') && 
            name.split(' ').length >= 2) {
          result.agentName = name;
          console.log(`Extracted agent name "${result.agentName}" using pattern: ${pattern}`);
          break;
        }
      }
    }

    // Extract agent phone - look near "Buyer's Agent Details" section
    const phonePatterns = [
      /Buyer(?:'s)?\s*Agent\s*Details[^]*?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,  // Phone after Buyer's Agent Details
      /(?:phone|cell|mobile|tel)[:\s]*(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/i,
      /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/,
    ];
    for (const pattern of phonePatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.agentPhone = match[1];
        break;
      }
    }

    // Extract agent email - look for email near agent details, exclude ShowingTime emails
    const emailPatterns = [
      /Buyer(?:'s)?\s*Agent\s*Details[^]*?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
    ];
    for (const pattern of emailPatterns) {
      const match = combined.match(pattern);
      if (match && !match[1].includes("showingtime.com") && !match[1].includes("noreply")) {
        result.agentEmail = match[1];
        break;
      }
    }

    // Extract structured ShowingTime feedback (Q&A format)
    // ShowingTime emails have 5 questions with answers:
    // 1. Is your client interested in this listing?
    // 2. Please rate your overall experience at this showing.
    // 3. Your (and your client's) opinion of the price:
    // 4. Please rate this listing (5=Best; 1=Worst):
    // 5. COMMENTS / RECOMMENDATIONS:
    const extractStructuredFeedback = (text: string): string | null => {
      const lines: string[] = [];
      
      // Question 1: Interest level
      const q1Match = text.match(/1\.\s*Is your client interested[^?]*\?\s*([^\n\d]{2,50})/i);
      if (q1Match) lines.push(`Interest: ${q1Match[1].trim()}`);
      
      // Question 2: Experience rating
      const q2Match = text.match(/2\.\s*(?:Please rate your overall experience|rate.*experience)[^.]*\.\s*([^\n\d]{2,50})/i);
      if (q2Match) lines.push(`Experience: ${q2Match[1].trim()}`);
      
      // Question 3: Price opinion
      const q3Match = text.match(/3\.\s*Your.*opinion of the price[:\s]*([^\n\d]{2,50})/i);
      if (q3Match) lines.push(`Price Opinion: ${q3Match[1].trim()}`);
      
      // Question 4: Rating
      const q4Match = text.match(/4\.\s*(?:Please rate this listing|rate.*listing)[^:]*:\s*(\d)/i);
      if (q4Match) lines.push(`Rating: ${q4Match[1]}/5`);
      
      // Question 5: Comments
      const q5Match = text.match(/5\.\s*COMMENTS\s*\/?\s*RECOMMENDATIONS[:\s]*([\s\S]{10,1000}?)(?=\n\n|\nAppointment Details|\nBuyer's Agent|\nManage|$)/i);
      if (q5Match) {
        const comments = q5Match[1].trim()
          .replace(/\s+/g, ' ')
          .substring(0, 500);
        lines.push(`\n\nComments: ${comments}`);
      }
      
      return lines.length > 0 ? lines.join('\n') : null;
    };
    
    result.feedbackText = extractStructuredFeedback(cleanBody);

    // Extract showing date
    const datePatterns = [
      /(?:showing|scheduled|date)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(?:at|@)/i,
      /(\w+\s+\d{1,2},?\s*\d{4})/i,
    ];
    for (const pattern of datePatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.showingDate = match[1];
        break;
      }
    }

    // Extract interest level
    const interestPatterns = [
      /1\.\s*Is your client interested[^?]*\?\s*(Somewhat|Very|Not interested|Maybe)/i,
      /interest(?:\s*level)?[:\s]*(Somewhat|Very|Not interested|Maybe|very\s*interested|interested|not\s*interested|considering)/i,
      /(very\s*interested|not\s*interested|strong\s*interest|mild\s*interest)/i,
    ];
    for (const pattern of interestPatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.interestLevel = match[1];
        break;
      }
    }

    return result;
  };

  // Process and store messages
  const processedEmails: any[] = [];
  const showingTimeFeedback: any[] = [];
  const showingUpdates: ShowingUpdate[] = [];

  for (const msg of allMessages) {
    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    
    const fromEmail = getHeader("From");
    const toEmail = getHeader("To");
    const subject = getHeader("Subject");
    const receivedAt = new Date(parseInt(msg.internalDate)).toISOString();

    // Extract email address from "Name <email>" format
    const extractEmail = (str: string) => {
      const match = str.match(/<(.+?)>/) || str.match(/([^\s<>]+@[^\s<>]+)/);
      return match ? match[1].toLowerCase() : str.toLowerCase();
    };

    const fromAddr = extractEmail(fromEmail);
    const toAddr = extractEmail(toEmail);

    // Check if this is a ShowingTime email
    const isShowingTime = fromAddr.includes("showingtime.com") || 
      subject.toLowerCase().includes("showing") ||
      showingTimeMessageIds.has(msg.id);
    
    // Find matching client by email
    let clientId = null;
    let matchedClient = clientEmails.get(fromAddr) || clientEmails.get(toAddr);
    
    // For ShowingTime emails, try to match by address or MLS ID and extract feedback
    let parsedEmail: ReturnType<typeof parseShowingTimeEmail> | null = null;
    
    if (isShowingTime) {
      const body = decodeBody(msg);
      parsedEmail = parseShowingTimeEmail(subject, body);
      
      console.log(`ShowingTime email - Subject: "${subject.substring(0, 50)}..." | Parsed MLS: ${parsedEmail.mlsId} | Parsed Address: ${parsedEmail.address} | Showing Count: ${parsedEmail.showingCount}`);
      
      if (!matchedClient) {
        // Try MLS ID match first
        if (parsedEmail.mlsId) {
          matchedClient = clientMlsIds.get(parsedEmail.mlsId.toLowerCase());
          if (matchedClient) {
            console.log(`Matched by MLS ID: ${parsedEmail.mlsId}`);
          }
        }
        
        // Try address match
        if (!matchedClient && parsedEmail.address) {
          const normalizedAddr = parsedEmail.address.toLowerCase().trim();
          console.log(`Trying to match ShowingTime address: "${normalizedAddr}"`);
          console.log(`First 3 words: "${normalizedAddr.split(' ').slice(0, 3).join(' ')}"`);
          
          for (const [addr, client] of clientAddresses.entries()) {
            const first3Match = normalizedAddr.split(' ').slice(0, 3).join(' ');
            const includesCheck = normalizedAddr.includes(addr);
            const substringCheck = addr.includes(first3Match);
            
            if (addr.includes('little bear')) {
              console.log(`Testing "${addr}": includes="${includesCheck}", substring="${substringCheck}"`);
            }
            
            if (includesCheck || substringCheck) {
              matchedClient = client;
              console.log(`Matched by address: "${parsedEmail.address}" -> "${addr}"`);
              break;
            }
          }
        }
        
        if (!matchedClient && (parsedEmail.mlsId || parsedEmail.address)) {
          console.log(`NO MATCH for MLS: ${parsedEmail.mlsId}, Address: ${parsedEmail.address}`);
        }
      }
      
      // If we found a match and have a showing count, record for update
      // Track SHOWING CONFIRMED emails to count showings per client
      const isShowingConfirmed = subject.toUpperCase().includes('SHOWING CONFIRMED');
      if (matchedClient && isShowingConfirmed) {
        const clientId = (matchedClient as any).id;
        const currentCount = showingUpdates.filter(u => u.clientId === clientId).length;
        showingUpdates.push({
          clientId,
          mlsId: parsedEmail.mlsId,
          address: parsedEmail.address,
          showingCount: currentCount + 1, // This is just a marker, we'll count later
        });
        console.log(`Found SHOWING CONFIRMED email for client ${clientId}`);
      }
    }
    
    if (matchedClient) {
      clientId = (matchedClient as any).id;
    }

    // Determine direction
    const agentEmail = tokenData.email_address.toLowerCase();
    const direction = fromAddr === agentEmail ? "outgoing" : "incoming";

    // Check if already logged
    const { data: existing } = await supabase
      .from("client_email_logs")
      .select("id")
      .eq("gmail_message_id", msg.id)
      .maybeSingle();

    if (!existing) {
      // Decode and clean body for ShowingTime emails
      const rawBody = isShowingTime ? decodeBody(msg) : msg.snippet;
      const cleanedBody = isShowingTime ? stripHtml(rawBody) : msg.snippet;
      
      const emailLog = {
        agent_id,
        client_id: clientId,
        gmail_message_id: msg.id,
        thread_id: msg.threadId,
        direction,
        from_email: fromEmail,
        to_email: toEmail,
        subject,
        snippet: msg.snippet,
        body_preview: isShowingTime ? cleanedBody.substring(0, 2000) : msg.snippet, // Store cleaned body
        received_at: receivedAt,
        is_read: true,
        labels: isShowingTime ? ["ShowingTime"] : [],
      };

      const { data: insertedEmail, error: insertError } = await supabase
        .from("client_email_logs")
        .insert(emailLog)
        .select("id")
        .single();

      if (!insertError && insertedEmail) {
        processedEmails.push(emailLog);

        // Only store feedback for "FEEDBACK RECEIVED" emails, not "SHOWING CONFIRMED"
        // SHOWING CONFIRMED emails are still used to extract showing counts
        const isFeedbackEmail = subject.toUpperCase().includes('FEEDBACK RECEIVED');
        
        if (isShowingTime && clientId && parsedEmail && isFeedbackEmail) {
          console.log(`Processing feedback for client ${clientId}, email ID: ${insertedEmail.id}`);
          
          // Check if feedback already exists for this email
          const { data: existingFeedback } = await supabase
            .from("showing_feedback")
            .select("id")
            .eq("source_email_id", insertedEmail.id)
            .maybeSingle();

          if (!existingFeedback) {
            // Safely parse showing date - use receivedAt as fallback if parsing fails
            let showingDateStr = receivedAt;
            if (parsedEmail.showingDate) {
              const parsed = new Date(parsedEmail.showingDate);
              if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
                showingDateStr = parsed.toISOString();
              }
            }
            
            const feedbackRecord = {
              agent_id,
              client_id: clientId,
              showing_agent_name: parsedEmail.agentName,
              showing_agent_email: parsedEmail.agentEmail,
              showing_agent_phone: parsedEmail.agentPhone,
              showing_date: showingDateStr,
              feedback: parsedEmail.feedbackText || cleanedBody.substring(0, 1000),
              buyer_interest_level: parsedEmail.interestLevel,
              source_email_id: insertedEmail.id,
              raw_email_content: rawBody.substring(0, 5000),
            };

            console.log(`Inserting feedback with agent: ${parsedEmail.agentName}`);

            const { data: insertedFeedback, error: feedbackError } = await supabase
              .from("showing_feedback")
              .insert(feedbackRecord)
              .select();

            if (feedbackError) {
              console.error("Failed to insert feedback:", JSON.stringify(feedbackError));
            } else {
              console.log(`Stored feedback for client ${clientId}. Records: ${insertedFeedback?.length || 0}`);
            }
          } else {
            console.log(`Feedback already exists for email ${insertedEmail.id}`);
          }

          showingTimeFeedback.push({
            subject,
            snippet: cleanedBody.substring(0, 500), // Use cleaned body
            received_at: receivedAt,
            clientId,
            agentName: parsedEmail.agentName,
            agentEmail: parsedEmail.agentEmail,
            agentPhone: parsedEmail.agentPhone,
          });
        }
      }
    }
  }

  // Count SHOWING CONFIRMED emails per client (each email = 1 showing)
  const clientShowingCounts = new Map<string, number>();
  for (const update of showingUpdates) {
    const current = clientShowingCounts.get(update.clientId) || 0;
    clientShowingCounts.set(update.clientId, current + 1);
  }

  let updatedClients = 0;
  for (const [cid, count] of clientShowingCounts.entries()) {
    const { error: updateError } = await supabase
      .from("clients")
      .update({ showings_to_date: count, updated_at: new Date().toISOString() })
      .eq("id", cid);
    
    if (!updateError) {
      updatedClients++;
      console.log(`Updated client ${cid} with ${count} showings`);
    } else {
      console.error(`Failed to update client ${cid}:`, updateError);
    }
  }

  return {
    success: true,
    synced_count: processedEmails.length,
    showingtime_count: showingTimeFeedback.length,
    clients_updated: updatedClients,
    showingtime_feedback: showingTimeFeedback,
    message: `Synced ${processedEmails.length} new emails (${showingTimeFeedback.length} ShowingTime notifications, ${updatedClients} clients updated)`,
  };
}
