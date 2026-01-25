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
  };
  internalDate: string;
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

    // Get agent_id from request
    const { agent_id, max_results = 50 } = await req.json();
    
    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: "agent_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get agent's Gmail tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("gmail_oauth_tokens")
      .select("*")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Gmail not connected. Please connect your Gmail account first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired and refresh if needed
    if (new Date(tokenData.token_expiry) < new Date()) {
      console.log("Token expired, refreshing...");
      
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          refresh_token: tokenData.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      const refreshData = await refreshResponse.json();
      
      if (!refreshResponse.ok) {
        console.error("Token refresh failed:", refreshData);
        return new Response(
          JSON.stringify({ error: "Failed to refresh Gmail token. Please reconnect Gmail." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshData.access_token;
      const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

      // Update token in database
      await supabase
        .from("gmail_oauth_tokens")
        .update({ access_token: accessToken, token_expiry: newExpiry, updated_at: new Date().toISOString() })
        .eq("agent_id", agent_id);
    }

    // Get client emails for matching
    const { data: clients } = await supabase
      .from("clients")
      .select("id, email, first_name, last_name")
      .eq("agent_id", agent_id)
      .not("email", "is", null);

    const clientEmails = new Map(
      clients?.filter(c => c.email).map(c => [c.email!.toLowerCase(), c]) || []
    );

    console.log(`Found ${clientEmails.size} clients with emails`);

    // Fetch emails from Gmail
    // Search for emails from/to client addresses OR ShowingTime notifications
    const searchQueries = [
      "from:noreply@showingtime.com",
      "from:notifications@showingtime.com",
      ...Array.from(clientEmails.keys()).slice(0, 20).map(email => `from:${email} OR to:${email}`)
    ];

    const allMessages: GmailMessage[] = [];

    for (const query of searchQueries.slice(0, 5)) { // Limit queries to avoid rate limits
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

      // Fetch full message details
      for (const msg of messageIds.slice(0, 10)) {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`;
        
        const msgResponse = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (msgResponse.ok) {
          const msgData = await msgResponse.json();
          allMessages.push(msgData);
        }
      }
    }

    console.log(`Fetched ${allMessages.length} messages from Gmail`);

    // Process and store messages
    const processedEmails = [];
    const showingTimeFeedback = [];

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
      const isShowingTime = fromAddr.includes("showingtime.com");
      
      // Find matching client
      let clientId = null;
      const matchedClient = clientEmails.get(fromAddr) || clientEmails.get(toAddr);
      if (matchedClient) {
        clientId = matchedClient.id;
      }

      // Determine direction
      const agentEmail = tokenData.email_address.toLowerCase();
      const direction = fromAddr === agentEmail ? "outgoing" : "incoming";

      // Check if already logged
      const { data: existing } = await supabase
        .from("client_email_logs")
        .select("id")
        .eq("gmail_message_id", msg.id)
        .single();

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
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced_count: processedEmails.length,
        showingtime_count: showingTimeFeedback.length,
        showingtime_feedback: showingTimeFeedback,
        message: `Synced ${processedEmails.length} new emails (${showingTimeFeedback.length} ShowingTime notifications)`,
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
