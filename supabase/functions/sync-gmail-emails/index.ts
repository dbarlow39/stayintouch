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
    const { agent_id, sync_all_agents = false, max_results = 50 } = body;
    
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
        const result = await syncAgentEmails(supabase, currentAgentId, max_results, GOOGLE_CLIENT_ID!, GOOGLE_CLIENT_SECRET!);
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
  GOOGLE_CLIENT_SECRET: string
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

  // Fetch emails from Gmail
  // Search for emails from/to client addresses OR ShowingTime notifications
  const clientEmailKeys = Array.from(clientEmails.keys()) as string[];
  const searchQueries = [
    "from:noreply@showingtime.com",
    "from:notifications@showingtime.com",
    "subject:showing confirmed",
    "subject:showings scheduled",
    ...clientEmailKeys.slice(0, 15).map((email) => `from:${email} OR to:${email}`)
  ];

  const allMessages: GmailMessage[] = [];
  const showingTimeMessageIds: Set<string> = new Set();

  for (const query of searchQueries.slice(0, 6)) { // Limit queries to avoid rate limits
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
        const textPart = msg.payload.parts.find(p => p.mimeType === "text/plain" || p.mimeType === "text/html");
        encoded = textPart?.body?.data;
      }
      if (!encoded) return msg.snippet || "";
      const decoded = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
      return decoded;
    } catch {
      return msg.snippet || "";
    }
  };

  // Parse ShowingTime email to extract showing count and property info
  const parseShowingTimeEmail = (subject: string, body: string): { address: string | null; mlsId: string | null; showingCount: number | null } => {
    const result = { address: null as string | null, mlsId: null as string | null, showingCount: null as number | null };
    
    const combined = `${subject}\n${body}`;
    
    // Look for showing count patterns
    // "You have 5 showings scheduled" or "Showing #3" or "3 total showings"
    const countPatterns = [
      /(\d+)\s*(?:total\s*)?showings?\s*(?:scheduled|confirmed|completed)/i,
      /showing\s*#?(\d+)/i,
      /(\d+)\s*showings?\s*to\s*date/i,
      /you\s*have\s*(\d+)\s*showings?/i,
    ];
    
    for (const pattern of countPatterns) {
      const match = combined.match(pattern);
      if (match) {
        result.showingCount = parseInt(match[1], 10);
        break;
      }
    }

    // Look for MLS ID
    const mlsMatch = combined.match(/MLS[#:\s]*([A-Z0-9-]+)/i);
    if (mlsMatch) {
      result.mlsId = mlsMatch[1].trim();
    }

    // Look for property address (common patterns)
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
    
    // For ShowingTime emails, try to match by address or MLS ID
    if (isShowingTime && !matchedClient) {
      const body = decodeBody(msg);
      const parsed = parseShowingTimeEmail(subject, body);
      
      // Try MLS ID match first
      if (parsed.mlsId) {
        matchedClient = clientMlsIds.get(parsed.mlsId.toLowerCase());
      }
      
      // Try address match
      if (!matchedClient && parsed.address) {
        const normalizedAddr = parsed.address.toLowerCase().trim();
        for (const [addr, client] of clientAddresses.entries()) {
          if (normalizedAddr.includes(addr) || addr.includes(normalizedAddr.split(' ').slice(0, 3).join(' '))) {
            matchedClient = client;
            break;
          }
        }
      }
      
      // If we found a match and have a showing count, record for update
      if (matchedClient && parsed.showingCount !== null) {
        showingUpdates.push({
          clientId: (matchedClient as any).id,
          mlsId: parsed.mlsId,
          address: parsed.address,
          showingCount: parsed.showingCount,
        });
        console.log(`Found showing count ${parsed.showingCount} for client ${(matchedClient as any).id}`);
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
        body_preview: msg.snippet,
        received_at: receivedAt,
        is_read: true,
        labels: isShowingTime ? ["ShowingTime"] : [],
      };

      const { error: insertError } = await supabase
        .from("client_email_logs")
        .insert(emailLog);

      if (!insertError) {
        processedEmails.push(emailLog);

        if (isShowingTime) {
          showingTimeFeedback.push({
            subject,
            snippet: msg.snippet,
            received_at: receivedAt,
            clientId,
          });
        }
      }
    }
  }

  // Update client showing counts - use the highest count found per client
  const clientShowingCounts = new Map<string, number>();
  for (const update of showingUpdates) {
    const current = clientShowingCounts.get(update.clientId) || 0;
    if (update.showingCount > current) {
      clientShowingCounts.set(update.clientId, update.showingCount);
    }
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
