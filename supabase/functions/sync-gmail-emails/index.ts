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

    const allResults: Array<{ agent_id: string; synced_count?: number; showingtime_count?: number; tasks_created?: number; error?: string }> = [];

    for (const currentAgentId of agentIds) {
      try {
        const result = await syncAgentEmails(supabase, currentAgentId, max_results, GOOGLE_CLIENT_ID!, GOOGLE_CLIENT_SECRET!, afterDate);
        
        // After syncing emails, auto-generate and create high-priority tasks
        let tasksCreated = 0;
        if (result.synced_count && result.synced_count > 0) {
          try {
            tasksCreated = await autoCreateTasksFromEmails(supabase, currentAgentId);
            console.log(`Auto-created ${tasksCreated} tasks for agent ${currentAgentId}`);
          } catch (taskErr) {
            console.error(`Error creating tasks for agent ${currentAgentId}:`, taskErr);
          }
        }
        
        allResults.push({ agent_id: currentAgentId, ...result, tasks_created: tasksCreated });
      } catch (err) {
        console.error(`Error syncing agent ${currentAgentId}:`, err);
        allResults.push({ agent_id: currentAgentId, error: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    const totalSynced = allResults.reduce((sum, r) => sum + (r.synced_count ?? 0), 0);
    const totalShowingTime = allResults.reduce((sum, r) => sum + (r.showingtime_count ?? 0), 0);
    const totalTasksCreated = allResults.reduce((sum, r) => sum + (r.tasks_created ?? 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        agents_processed: agentIds.length,
        synced_count: totalSynced,
        showingtime_count: totalShowingTime,
        tasks_created: totalTasksCreated,
        message: `Synced ${totalSynced} emails for ${agentIds.length} agent(s), created ${totalTasksCreated} tasks`,
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

  // Build a fast lookup map from *individual* email addresses -> client
  // (clients.email may contain comma/semicolon-separated addresses)
  const clientEmails = new Map<string, any>();
  clients?.forEach((c: any) => {
    if (!c.email) return;
    const parts = String(c.email)
      .split(/[;,]/g)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    for (const email of parts) {
      // Last write wins if duplicates exist; that's fine for our matching.
      clientEmails.set(email, c);
    }
  });

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
  console.log(`Sample MLS IDs in map:`, Array.from(clientMlsIds.keys()).slice(0, 20));
  console.log(`Sample addresses in map:`, Array.from(clientAddresses.keys()).slice(0, 10));

  // Fetch emails from Gmail
  // NOTE: The previous implementation created one Gmail search query per client batch,
  // which can easily exceed runtime limits and cause the browser to report "Failed to fetch".
  // Instead, fetch a bounded set of recent messages (Inbox+Sent) and match locally.

  const effectiveMaxResults = Math.min(Number(max_results) || 100, 200);
  const dateFilter = afterDate ? ` after:${afterDate}` : "";

  const allMessages: GmailMessage[] = [];
  const showingTimeMessageIds: Set<string> = new Set();
  const seenMessageIds: Set<string> = new Set();

  const listQueries: Array<{ name: string; q: string; isShowingTime: boolean }> = [
    {
      name: "showingtime",
      q: `(from:showingtime.com OR from:callcenter@showingtime.com)${dateFilter}`,
      isShowingTime: true,
    },
    {
      name: "recent",
      q: `(in:inbox OR in:sent)${dateFilter}`,
      isShowingTime: false,
    },
  ];

  const idsToFetch: Array<{ id: string; isShowingTime: boolean }> = [];

  for (const { name, q, isShowingTime } of listQueries) {
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${effectiveMaxResults}&q=${encodeURIComponent(q)}`;

    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error(`Gmail list error (${name}):`, errorText);
      continue;
    }

    const listData = await listResponse.json();
    const messageIds = (listData.messages || []) as Array<{ id: string }>;
    console.log(`Query "${name}" returned ${messageIds.length} message ids`);

    for (const msg of messageIds) {
      if (seenMessageIds.has(msg.id)) continue;
      seenMessageIds.add(msg.id);
      idsToFetch.push({ id: msg.id, isShowingTime });
    }
  }

  // Simple concurrency limiter to keep runtime down
  const mapLimit = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
    const results: R[] = [];
    const executing = new Set<Promise<void>>();
    for (const item of items) {
      const p = (async () => {
        results.push(await fn(item));
      })();
      executing.add(p);
      p.finally(() => executing.delete(p));
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    await Promise.all(executing);
    return results;
  };

  const fetched = await mapLimit(
    idsToFetch,
    8,
    async ({ id, isShowingTime }) => {
      const msgUrl = isShowingTime
        ? `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`
        : `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;

      const msgResponse = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgResponse.ok) return null;

      const msgData = (await msgResponse.json()) as GmailMessage;
      if (isShowingTime) showingTimeMessageIds.add(id);
      return msgData;
    }
  );

  for (const msg of fetched) {
    if (msg) allMessages.push(msg);
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
      .replace(/&#35;/g, '#')   // Handle # character entity
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")  // Handle hex encoded apostrophe
      .replace(/&#x2019;/g, "'")  // Handle smart quote
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
    
    // Remove leading artifact numbers like "96 Feedback Received" -> "Feedback Received"
    result = result.replace(/^\d{1,3}\s+(Feedback|ShowingTime|Sell|Showing)/i, '$1');
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
    
    // Extract "Total # of Showings: X" from email body
    // Try multiple patterns to catch variations
    const showingPatterns = [
      /Total\s*#\s*of\s*Showings[:\s]*(\d+)/i,  // Standard: "Total # of Showings: 5"
      /Total\s+of\s+Showings[:\s]*(\d+)/i,       // Without #: "Total of Showings: 5"
      /Total\s*Showings[:\s]*(\d+)/i,            // Short: "Total Showings: 5"
    ];
    for (const pattern of showingPatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.showingCount = parseInt(match[1], 10);
        console.log(`Extracted Total Showings: ${result.showingCount} using pattern: ${pattern}`);
        break;
      }
    }

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
        // Strip brokerage-related words from anywhere in the name (not just end)
        const brokerageWords = /\b(Keller|Williams|Realty|Properties|Real\s*Estate|Brokerage|BHHS|Coldwell|Banker|Century|21|RE\/MAX|ERA|Red|Frog|Hanna|Howard|Services)\b/gi;
        // Only strip if not a common first/last name
        const words = name.split(/\s+/);
        // Keep only the first 2-3 words that look like names (capitalized, not brokerage words)
        const nameWords: string[] = [];
        for (const word of words) {
          const lowerWord = word.toLowerCase();
          // Stop at common brokerage/company words
          if (['keller', 'williams', 'realty', 'properties', 'estate', 'brokerage',
               'bhhs', 'coldwell', 'banker', 'century', '21', 'remax', 're/max',
               'era', 'services', 'hanna', 'red', 'frog', 'key', 'exp', 'compass',
               'berkshire', 'hathaway', 'sotheby', 'christie', 'weichert', 'howard'].includes(lowerWord)) {
            break; // Stop at brokerage words
          }
          nameWords.push(word);
          if (nameWords.length >= 2) break; // Max 2 name parts (First Last)
        }
        name = nameWords.join(' ').trim();
        
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
      const q1Match = text.match(/1\.\s*Is your client interested[^?]*\?\s*(Somewhat|Very|Not interested|Maybe|Yes|No)/i);
      if (q1Match) lines.push(`Interest: ${q1Match[1].trim()}`);
      
      // Question 2: Experience rating
      const q2Match = text.match(/2\.\s*(?:Please rate your overall experience|rate.*experience)[^.]*\.\s*(Excellent|Good|Fair|Poor)/i);
      if (q2Match) lines.push(`Experience: ${q2Match[1].trim()}`);
      
      // Question 3: Price opinion
      const q3Match = text.match(/3\.\s*Your.*opinion of the price[:\s]*(Too high|Just right|Too low|About right|Fair)/i);
      if (q3Match) lines.push(`Price Opinion: ${q3Match[1].trim()}`);
      
      // Question 4: Rating
      const q4Match = text.match(/4\.\s*(?:Please rate this listing|rate.*listing)[^:]*:\s*(\d)/i);
      if (q4Match) lines.push(`Rating: ${q4Match[1]}/5`);
      
      // Question 5: Comments - capture everything until "Manage Feedback" or "Appointment Details"
      const q5Match = text.match(/5\.\s*COMMENTS?\s*\/?\s*RECOMMENDATIONS?[:\s]*([\s\S]+?)(?=\s*Manage\s*Feedback|\s*Appointment\s*Details|\s*Buyer's\s*Agent|\s*Thanks!|$)/i);
      if (q5Match) {
        let comments = q5Match[1].trim()
          .replace(/\s+/g, ' ')
          .replace(/Manage\s*Feedback.*$/i, '') // Remove any trailing "Manage Feedback" text
          .trim()
          .substring(0, 500);
        if (comments.length > 10) {
          lines.push(`\nComments: ${comments}`);
        }
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
    const ccEmail = getHeader("Cc");
    const subject = getHeader("Subject");
    
    // Parse the email's actual date from Gmail API
    // Gmail internalDate is milliseconds since epoch as a string
    // Also check for Date header as fallback
    let receivedAt: string;
    if (msg.internalDate) {
      const timestamp = parseInt(msg.internalDate, 10);
      receivedAt = new Date(timestamp).toISOString();
      // Log for debugging date issues
      if (subject.includes("Royal Oak") || subject.includes("dotloop")) {
        console.log(`[DATE DEBUG] Message "${subject.substring(0, 50)}..." - internalDate: ${msg.internalDate}, parsed: ${receivedAt}`);
      }
    } else {
      // Fallback to Date header if internalDate not present
      const dateHeader = getHeader("Date");
      receivedAt = dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString();
      console.log(`[DATE DEBUG] No internalDate for "${subject.substring(0, 50)}...", using Date header: ${dateHeader}, parsed: ${receivedAt}`);
    }

    // Extract email address from "Name <email>" format
    const extractEmail = (str: string) => {
      const match = str.match(/<(.+?)>/) || str.match(/([^\s<>]+@[^\s<>]+)/);
      return match ? match[1].toLowerCase() : str.toLowerCase();
    };

    // Extract ALL email addresses from headers (To/Cc often contain multiple addresses)
    const extractEmails = (str: string): string[] => {
      if (!str) return [];
      const matches = str.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
      if (matches && matches.length > 0) {
        return matches.map((m) => m.toLowerCase());
      }
      const single = extractEmail(str);
      return single ? [single] : [];
    };

    const fromAddrs = extractEmails(fromEmail);
    const toAddrs = [...extractEmails(toEmail), ...extractEmails(ccEmail)];

    const fromAddr = fromAddrs[0] || extractEmail(fromEmail);
    const toAddr = toAddrs[0] || extractEmail(toEmail);

    // Check if this is a ShowingTime email - ONLY check sender, not subject
    // This ensures client-forwarded emails with ShowingTime content are not treated as ShowingTime emails
    const isShowingTime = fromAddr.includes("showingtime.com") || 
      showingTimeMessageIds.has(msg.id);
    
    // Find matching client by email
    let clientId = null;
    const matchByAny = (emails: string[]) => {
      for (const e of emails) {
        const match = clientEmails.get(e);
        if (match) return match;
      }
      return null;
    };

    let matchedClient = matchByAny(fromAddrs) || matchByAny(toAddrs) || clientEmails.get(fromAddr) || clientEmails.get(toAddr);
    
    // For ShowingTime emails, try to match by address or MLS ID and extract feedback
    let parsedEmail: ReturnType<typeof parseShowingTimeEmail> | null = null;
    
    if (isShowingTime) {
      const body = decodeBody(msg);
      parsedEmail = parseShowingTimeEmail(subject, body);
      
      console.log(`ShowingTime email - Subject: "${subject.substring(0, 50)}..." | Parsed MLS: ${parsedEmail.mlsId} | Parsed Address: ${parsedEmail.address} | Showing Count: ${parsedEmail.showingCount}`);
      
      if (!matchedClient) {
        // Try MLS ID match first
        if (parsedEmail.mlsId) {
          const mlsIdLower = parsedEmail.mlsId.toLowerCase().trim();
          console.log(`Looking up MLS ID "${mlsIdLower}" in map of ${clientMlsIds.size} entries`);
          matchedClient = clientMlsIds.get(mlsIdLower);
          if (matchedClient) {
            console.log(`Matched by MLS ID: ${parsedEmail.mlsId} -> client ${(matchedClient as any).id}`);
          } else {
            console.log(`MLS ID "${mlsIdLower}" NOT found in map. First 10 keys: ${Array.from(clientMlsIds.keys()).slice(0, 10).join(', ')}`);
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
      
      // If we found a match and have a showing count from the email, record for update
      // Use the "Total # of Showings" value from the email (most accurate)
      if (matchedClient && parsedEmail.showingCount !== null) {
        const clientId = (matchedClient as any).id;
        const existingUpdate = showingUpdates.find(u => u.clientId === clientId);
        // Keep the highest showing count (most recent email should have highest)
        if (!existingUpdate || parsedEmail.showingCount > (existingUpdate.showingCount || 0)) {
          if (existingUpdate) {
            existingUpdate.showingCount = parsedEmail.showingCount;
          } else {
            showingUpdates.push({
              clientId,
              mlsId: parsedEmail.mlsId,
              address: parsedEmail.address,
              showingCount: parsedEmail.showingCount,
            });
          }
          console.log(`Found "Total # of Showings: ${parsedEmail.showingCount}" for client ${clientId}`);
        }
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

  // Update clients with "Total # of Showings" extracted from emails
  let updatedClients = 0;
  for (const update of showingUpdates) {
    if (update.showingCount !== null && update.showingCount > 0) {
      const { error: updateError } = await supabase
        .from("clients")
        .update({ showings_to_date: update.showingCount, updated_at: new Date().toISOString() })
        .eq("id", update.clientId);
      
      if (!updateError) {
        updatedClients++;
        console.log(`Updated client ${update.clientId} with ${update.showingCount} showings`);
      } else {
        console.error(`Failed to update client ${update.clientId}:`, updateError);
      }
    }
  }

  // BACKFILL: Create feedback records for linked emails that don't have feedback yet
  let backfilledFeedback = 0;
  const { data: orphanedFeedbackEmails } = await supabase
    .from("client_email_logs")
    .select("id, client_id, subject, body_preview, received_at")
    .eq("agent_id", agent_id)
    .not("client_id", "is", null)
    .ilike("subject", "%FEEDBACK RECEIVED%")
    .order("received_at", { ascending: false })
    .limit(100);

  if (orphanedFeedbackEmails && orphanedFeedbackEmails.length > 0) {
    console.log(`Checking ${orphanedFeedbackEmails.length} linked feedback emails for missing feedback records`);
    
    for (const email of orphanedFeedbackEmails) {
      // Check if feedback already exists for this email
      const { data: existingFeedback } = await supabase
        .from("showing_feedback")
        .select("id")
        .eq("source_email_id", email.id)
        .maybeSingle();

      if (!existingFeedback) {
        console.log(`Backfilling feedback for email ${email.id} - ${email.subject}`);
        
        // Get the client's agent_id for RLS compliance
        const { data: clientData } = await supabase
          .from("clients")
          .select("agent_id")
          .eq("id", email.client_id)
          .single();

        if (clientData) {
          // Parse the feedback from body_preview
          const bodyText = email.body_preview || "";
          const parsedFeedback = parseShowingTimeEmail(email.subject || "", bodyText);
          
          const feedbackRecord = {
            agent_id: clientData.agent_id,
            client_id: email.client_id,
            showing_agent_name: parsedFeedback.agentName,
            showing_agent_email: parsedFeedback.agentEmail,
            showing_agent_phone: parsedFeedback.agentPhone,
            showing_date: parsedFeedback.showingDate ? new Date(parsedFeedback.showingDate).toISOString() : email.received_at,
            feedback: parsedFeedback.feedbackText || bodyText.substring(0, 1000),
            buyer_interest_level: parsedFeedback.interestLevel,
            source_email_id: email.id,
          };

          const { error: insertError } = await supabase
            .from("showing_feedback")
            .insert(feedbackRecord);

          if (!insertError) {
            backfilledFeedback++;
            console.log(`Backfilled feedback for client ${email.client_id}, agent: ${parsedFeedback.agentName}`);
          } else {
            console.error(`Failed to backfill feedback for email ${email.id}:`, insertError);
          }
        }
      }
    }
  }

  return {
    success: true,
    synced_count: processedEmails.length,
    showingtime_count: showingTimeFeedback.length,
    clients_updated: updatedClients,
    backfilled_feedback: backfilledFeedback,
    showingtime_feedback: showingTimeFeedback,
    message: `Synced ${processedEmails.length} new emails (${showingTimeFeedback.length} ShowingTime notifications, ${updatedClients} clients updated, ${backfilledFeedback} feedback backfilled)`,
  };
}

// Auto-create high-priority tasks from AI analysis of recent emails
async function autoCreateTasksFromEmails(supabase: any, agentId: string): Promise<number> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('LOVABLE_API_KEY not configured, skipping auto task creation');
    return 0;
  }

  // Fetch recent emails (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: emails, error: emailsError } = await supabase
    .from('client_email_logs')
    .select(`
      id, subject, snippet, body_preview, direction,
      from_email, to_email, received_at, client_id
    `)
    .eq('agent_id', agentId)
    .gte('received_at', sevenDaysAgo.toISOString())
    .order('received_at', { ascending: false })
    .limit(100);

  if (emailsError || !emails || emails.length === 0) {
    console.log('No recent emails to analyze for task creation');
    return 0;
  }

  // Get client names for context
  const clientIds = [...new Set(emails.map((e: any) => e.client_id).filter(Boolean))];
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name')
    .in('id', clientIds);

  const clientNameMap = new Map(
    clients?.map((c: any) => [c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim()]) || []
  );

  // Get existing pending tasks to avoid duplicates
  const { data: existingTasks } = await supabase
    .from('tasks')
    .select('title')
    .eq('agent_id', agentId)
    .neq('status', 'completed');

  const existingTaskTitles = new Set(
    existingTasks?.map((t: any) => t.title.toLowerCase()) || []
  );

  // Format emails for AI analysis
  const emailsForAnalysis = emails.map((email: any) => ({
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

  const today = new Date().toISOString().split('T')[0];

  // Call Lovable AI for task suggestions
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
          content: `You are an AI assistant for a real estate agent. Analyze their email communications and identify ONLY urgent or high-priority tasks that need immediate attention. Be conservative - only suggest tasks that are clearly time-sensitive or important.

Focus on:
1. Unanswered incoming emails from the last 48 hours
2. Clear action items or commitments mentioned in emails
3. Time-sensitive matters (offers, deadlines, showings)

Today's date is ${today}. Only return tasks with priority "urgent" or "high".`
        },
        {
          role: 'user',
          content: `Analyze these emails and suggest up to 3 urgent/high-priority tasks:

${JSON.stringify(emailsForAnalysis.slice(0, 50), null, 2)}

Existing tasks to avoid: ${Array.from(existingTaskTitles).join(', ')}

Return JSON: { "suggestions": [{ "title": string, "description": string, "priority": "urgent"|"high" }] }`
        }
      ],
      response_format: { type: "json_object" }
    }),
  });

  if (!aiResponse.ok) {
    console.error('AI Gateway error for auto task creation:', aiResponse.status);
    return 0;
  }

  const aiData = await aiResponse.json();
  let suggestions: Array<{ title: string; description: string; priority: string }> = [];
  
  try {
    const result = JSON.parse(aiData.choices[0].message.content);
    suggestions = result.suggestions || [];
  } catch (parseErr) {
    console.error('Failed to parse AI response:', parseErr);
    return 0;
  }

  // Filter to only urgent/high priority and check for duplicates
  const tasksToCreate = suggestions
    .filter(s => ['urgent', 'high'].includes(s.priority))
    .filter(s => !existingTaskTitles.has(s.title.toLowerCase()));

  if (tasksToCreate.length === 0) {
    return 0;
  }

  // Insert new tasks
  const { error: insertError } = await supabase
    .from('tasks')
    .insert(tasksToCreate.map(task => ({
      agent_id: agentId,
      title: task.title,
      description: `[Auto-created] ${task.description}`,
      priority: task.priority,
      status: 'pending',
    })));

  if (insertError) {
    console.error('Error inserting auto-created tasks:', insertError);
    return 0;
  }

  return tasksToCreate.length;
}
