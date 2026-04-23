import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "auto-send-appraisal-confirmed@2026-04-23.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEYWORD = "APPRAISAL CONFIRMED";
const MAX_SOURCE_AGE_DAYS = 7;
const PUBLIC_LOGO_URL = 'https://ujhohggsvijjqoatvwnl.supabase.co/storage/v1/object/public/email-assets/logo.jpg';

interface TriggerPayload {
  agent_id: string;
  gmail_message_id: string;
  subject: string;
  from_email: string;
  received_at: string;
  raw_body: string;
}

interface ParsedAppraisalEmail {
  subjectAddress: string | null;
  bodyAddress: string | null;
  mlsId: string | null;
  presentedBy: string | null;
  appraisalDateTime: string | null;
  listingContactEmails: string[];
  appraiserName: string | null;
  appraiserCompany: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload: TriggerPayload = await req.json();
    const { agent_id, gmail_message_id, subject, from_email, received_at, raw_body } = payload;

    console.log(`[${VERSION}] Triggered for message ${gmail_message_id}, subject: "${subject?.substring(0, 80)}"`);

    // Gate 1: Subject must contain keyword (case-insensitive)
    if (!subject || !subject.toUpperCase().includes(KEYWORD)) {
      return jsonResponse({ skipped: true, reason: "Subject does not contain APPRAISAL CONFIRMED" });
    }

    // Gate 2: Dedupe - check auto_email_log for this gmail_message_id + keyword
    const { data: existingLog } = await supabase
      .from("auto_email_log")
      .select("id, status")
      .eq("gmail_message_id", gmail_message_id)
      .eq("keyword", KEYWORD)
      .maybeSingle();

    if (existingLog) {
      console.log(`Already processed: ${existingLog.id} (status: ${existingLog.status})`);
      return jsonResponse({ skipped: true, reason: "Already processed" });
    }

    // Gate 3: Source email must be < 7 days old
    const receivedDate = new Date(received_at);
    const ageDays = (Date.now() - receivedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > MAX_SOURCE_AGE_DAYS) {
      await logSkip(supabase, agent_id, gmail_message_id, subject, `Source email is ${Math.round(ageDays)} days old (max ${MAX_SOURCE_AGE_DAYS})`, {});
      return jsonResponse({ skipped: true, reason: "Source email too old" });
    }

    // Parse the email
    const parsed = parseAppraisalConfirmedEmail(subject, raw_body);
    console.log(`Parsed:`, JSON.stringify(parsed, null, 2));

    // Get agent profile for "presented by" check + signature + BCC
    const { data: agentProfile } = await supabase
      .from("profiles")
      .select("id, email, preferred_email, first_name, last_name, full_name, cell_phone, bio")
      .eq("id", agent_id)
      .single();

    if (!agentProfile) {
      await logSkip(supabase, agent_id, gmail_message_id, subject, "Agent profile not found", parsed);
      return jsonResponse({ skipped: true, reason: "Agent profile not found" });
    }

    const agentBccEmail = agentProfile.preferred_email || agentProfile.email;

    // Gate 4: Address must be present in subject
    if (!parsed.subjectAddress) {
      await sendAgentNotification(supabase, agentBccEmail, "Could not parse property address from subject line", subject, parsed, null);
      await logSkip(supabase, agent_id, gmail_message_id, subject, "Could not parse address from subject", parsed);
      return jsonResponse({ skipped: true, reason: "No address in subject" });
    }

    // Gate 5: Appraisal date/time must be present in subject
    if (!parsed.appraisalDateTime) {
      await sendAgentNotification(supabase, agentBccEmail, "Could not parse appraisal date/time from subject line", subject, parsed, null);
      await logSkip(supabase, agent_id, gmail_message_id, subject, "Could not parse appraisal date/time", parsed);
      return jsonResponse({ skipped: true, reason: "No date/time in subject" });
    }

    // Gate 6: Cross-validate - subject address should appear in body
    if (parsed.bodyAddress) {
      const subjStreet = extractStreetPart(parsed.subjectAddress).toLowerCase();
      const bodyAddrLower = parsed.bodyAddress.toLowerCase();
      if (subjStreet && !bodyAddrLower.includes(subjStreet)) {
        await sendAgentNotification(supabase, agentBccEmail, `Address mismatch: subject "${parsed.subjectAddress}" does not match body "${parsed.bodyAddress}"`, subject, parsed, null);
        await logSkip(supabase, agent_id, gmail_message_id, subject, "Address in subject does not match body", parsed);
        return jsonResponse({ skipped: true, reason: "Address mismatch between subject and body" });
      }
    }

    // Gate 7: "Presented by" name should match agent profile name (if found in body)
    if (parsed.presentedBy) {
      const agentNameLower = (agentProfile.full_name || `${agentProfile.first_name || ""} ${agentProfile.last_name || ""}`).trim().toLowerCase();
      const presentedByLower = parsed.presentedBy.toLowerCase();
      if (agentNameLower && !presentedByLower.includes(agentNameLower) && !agentNameLower.includes(presentedByLower)) {
        await sendAgentNotification(supabase, agentBccEmail, `"Presented by" name "${parsed.presentedBy}" does not match agent name "${agentProfile.full_name}". This may be a co-broker email forwarded to your inbox.`, subject, parsed, null);
        await logSkip(supabase, agent_id, gmail_message_id, subject, `"Presented by" name mismatch (got "${parsed.presentedBy}", expected "${agentProfile.full_name}")`, parsed);
        return jsonResponse({ skipped: true, reason: "Presented-by name mismatch" });
      }
    }

    // Gate 8: Match to client (by MLS ID first, then by address)
    const subjStreetPart = extractStreetPart(parsed.subjectAddress);
    const { data: agentClients } = await supabase
      .from("clients")
      .select("id, first_name, last_name, email, mls_id, street_number, street_name, city, state, zip")
      .eq("agent_id", agent_id);

    let matchedClient: any = null;
    let matchReason = "";

    // Try MLS ID first
    if (parsed.mlsId && agentClients) {
      matchedClient = agentClients.find((c: any) => c.mls_id && c.mls_id.toLowerCase().trim() === parsed.mlsId!.toLowerCase().trim());
      if (matchedClient) matchReason = `MLS ID ${parsed.mlsId}`;
    }

    // Try address loose match
    if (!matchedClient && agentClients) {
      const subjStreetLower = subjStreetPart.toLowerCase().trim();
      const matches = agentClients.filter((c: any) => {
        if (!c.street_number || !c.street_name) return false;
        const clientAddr = `${c.street_number} ${c.street_name}`.toLowerCase().trim();
        return subjStreetLower.includes(clientAddr) || clientAddr === subjStreetLower;
      });

      if (matches.length === 1) {
        matchedClient = matches[0];
        matchReason = `address "${subjStreetPart}"`;
      } else if (matches.length > 1) {
        await sendAgentNotification(supabase, agentBccEmail, `Multiple clients (${matches.length}) match address "${subjStreetPart}". Please send manually to avoid sending to the wrong client.`, subject, parsed, null);
        await logSkip(supabase, agent_id, gmail_message_id, subject, `Ambiguous: ${matches.length} clients matched address`, parsed);
        return jsonResponse({ skipped: true, reason: "Multiple matching clients" });
      }
    }

    if (!matchedClient) {
      await sendAgentNotification(supabase, agentBccEmail, `No client record matches MLS ID "${parsed.mlsId || "(none)"}" or address "${subjStreetPart}". Add the client to your CRM, then send manually.`, subject, parsed, null);
      await logSkip(supabase, agent_id, gmail_message_id, subject, `No client matched (MLS: ${parsed.mlsId}, address: ${subjStreetPart})`, parsed);
      return jsonResponse({ skipped: true, reason: "No matching client" });
    }

    // Gate 9: Client must have email(s)
    if (!matchedClient.email) {
      const clientName = `${matchedClient.first_name || ""} ${matchedClient.last_name || ""}`.trim();
      await sendAgentNotification(supabase, agentBccEmail, `Client "${clientName}" matched but has no email address on file. Add their email in the CRM, then send manually.`, subject, parsed, matchedClient);
      await logSkip(supabase, agent_id, gmail_message_id, subject, `Matched client has no email`, parsed, matchedClient.id);
      return jsonResponse({ skipped: true, reason: "Client has no email" });
    }

    // Parse comma/semicolon-separated emails from clients.email
    const recipientEmails = String(matchedClient.email)
      .split(/[;,]/g)
      .map((e) => e.trim())
      .filter((e) => e && e.includes("@"));

    if (recipientEmails.length === 0) {
      await sendAgentNotification(supabase, agentBccEmail, `Client email field could not be parsed: "${matchedClient.email}"`, subject, parsed, matchedClient);
      await logSkip(supabase, agent_id, gmail_message_id, subject, `Could not parse client email`, parsed, matchedClient.id);
      return jsonResponse({ skipped: true, reason: "Invalid client email format" });
    }

    // ALL GATES PASSED — send the email
    console.log(`All validations passed. Sending to: ${recipientEmails.join(", ")}, BCC: ${agentBccEmail}`);

    const sendResult = await sendAppraisalEmail(
      recipientEmails,
      agentBccEmail,
      agentProfile,
      matchedClient,
      parsed,
    );

    // Log success
    await supabase.from("auto_email_log").insert({
      agent_id,
      gmail_message_id,
      keyword: KEYWORD,
      status: "sent",
      reason: `Matched client by ${matchReason}`,
      parsed_data: parsed,
      recipient_emails: recipientEmails,
      client_id: matchedClient.id,
      source_subject: subject,
    });

    return jsonResponse({
      success: true,
      sent_to: recipientEmails,
      bcc: agentBccEmail,
      client_id: matchedClient.id,
      resend_id: sendResult.id,
    });

  } catch (err) {
    console.error("[auto-send-appraisal-confirmed] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", _version: VERSION }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseAppraisalConfirmedEmail(subject: string, rawBody: string): ParsedAppraisalEmail {
  const cleanBody = stripHtml(rawBody);

  // Subject format: "APPRAISAL CONFIRMED | 6121 Preve Ridge Drive, New Albany, OH 43054 Thu, 4/23 1:30 PM"
  // Extract everything after the pipe
  let subjectAddress: string | null = null;
  let appraisalDateTime: string | null = null;

  const pipeMatch = subject.match(/APPRAISAL\s+CONFIRMED\s*[\|\-:]\s*(.+)/i);
  if (pipeMatch) {
    const rest = pipeMatch[1].trim();
    // Date/time pattern: "Thu, 4/23 1:30 PM" or "4/23/26 1:30 PM" etc.
    const dateTimeMatch = rest.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s*)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/);
    if (dateTimeMatch) {
      appraisalDateTime = dateTimeMatch[0].trim();
      // Address is everything before the date/time
      subjectAddress = rest.substring(0, dateTimeMatch.index!).trim().replace(/[,\s]+$/, "");
    } else {
      subjectAddress = rest;
    }
  }

  // Body address: look for street number + street name pattern
  let bodyAddress: string | null = null;
  const bodyAddrMatch = cleanBody.match(/\b(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Ct|Court|Way|Pl|Place|Cir|Circle|Ter|Terrace|Pkwy|Parkway)\b[^,\n]*)/i);
  if (bodyAddrMatch) {
    bodyAddress = bodyAddrMatch[1].trim();
  }

  // MLS ID: "ID# 226012476" or similar
  let mlsId: string | null = null;
  const mlsPatterns = [
    /\bMLS\s*(?:ID|#)?[:\s#]+(\d{6,10})\b/i,
    /\bID[#:\s]+(\d{6,10})\b/i,
    /\blisting\s*(?:id|#)[:\s]*(\d{6,10})\b/i,
  ];
  for (const p of mlsPatterns) {
    const m = cleanBody.match(p);
    if (m) { mlsId = m[1].trim(); break; }
  }

  // "Presented by" - usually appears as "Presented by [Name]"
  let presentedBy: string | null = null;
  const presentedMatch = cleanBody.match(/Presented\s+by[:\s]+([A-Z][a-zA-Z'\.\-]+(?:\s+[A-Z][a-zA-Z'\.\-]+){0,3})/i);
  if (presentedMatch) {
    presentedBy = presentedMatch[1].trim();
  }

  // Listing contact emails: extract any emails from a "Listing Contact" section
  const listingContactEmails: string[] = [];
  const listingSection = cleanBody.match(/Listing\s+Contacts?[\s\S]{0,1500}/i);
  if (listingSection) {
    const emailMatches = listingSection[0].match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
    if (emailMatches) {
      for (const e of emailMatches) {
        const lower = e.toLowerCase();
        if (!listingContactEmails.includes(lower)) listingContactEmails.push(lower);
      }
    }
  }

  // Appraiser info (optional, for email body)
  let appraiserName: string | null = null;
  let appraiserCompany: string | null = null;
  const appraiserMatch = cleanBody.match(/Appraiser[:\s]+([A-Z][a-zA-Z'\.\-]+(?:\s+[A-Z][a-zA-Z'\.\-]+){0,3})/i);
  if (appraiserMatch) appraiserName = appraiserMatch[1].trim();
  const companyMatch = cleanBody.match(/(?:Company|Firm)[:\s]+([A-Z][a-zA-Z0-9'\.\-\s&,]+?)(?:\n|$|<)/);
  if (companyMatch) appraiserCompany = companyMatch[1].trim();

  return {
    subjectAddress,
    bodyAddress,
    mlsId,
    presentedBy,
    appraisalDateTime,
    listingContactEmails,
    appraiserName,
    appraiserCompany,
  };
}

function extractStreetPart(fullAddress: string): string {
  // "6121 Preve Ridge Drive, New Albany, OH 43054" -> "6121 Preve Ridge Drive"
  const commaIdx = fullAddress.indexOf(",");
  return commaIdx > 0 ? fullAddress.substring(0, commaIdx).trim() : fullAddress.trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Email sending
// ─────────────────────────────────────────────────────────────────────────────

async function sendAppraisalEmail(
  toEmails: string[],
  bccEmail: string,
  agentProfile: any,
  client: any,
  parsed: ParsedAppraisalEmail,
): Promise<{ id: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

  const sellerFirstNames = [client.first_name].filter(Boolean).join(" ") || "there";
  const agentFirstName = agentProfile.first_name || "";
  const agentFullName = agentProfile.full_name || `${agentProfile.first_name || ""} ${agentProfile.last_name || ""}`.trim();
  const agentPhone = agentProfile.cell_phone || "";
  const agentEmail = agentProfile.preferred_email || agentProfile.email || "";
  const agentBio = agentProfile.bio || "";
  const fromName = agentFullName || "Your Agent";
  const replyTo = agentEmail;
  const propertyAddress = parsed.subjectAddress || "your property";

  // Signature
  let signatureHtml = "";
  if (agentBio && /<[a-z][\s\S]*>/i.test(agentBio)) {
    signatureHtml = agentBio.replace(/<P>/gi, "<br><br>");
  } else if (agentBio) {
    signatureHtml = `<p style="margin: 0; line-height: 1.6; color: #374151; white-space: pre-line;">${agentBio}</p>`;
  } else {
    signatureHtml = `
      <p style="margin: 0; color: #374151;">${agentFullName}</p>
      ${agentPhone ? `<p style="margin: 0; color: #374151;">cell: ${agentPhone}</p>` : ""}
      ${agentEmail ? `<p style="margin: 0; color: #374151;">email: ${agentEmail}</p>` : ""}
    `;
  }

  const appointmentLine = parsed.appraisalDateTime
    ? `<p style="margin: 16px 0; line-height: 1.6; color: #374151;"><strong>Appraisal Appointment:</strong> ${escapeHtml(parsed.appraisalDateTime)}</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width: 640px; width: 100%; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
        <tr><td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align: middle;"><img src="${PUBLIC_LOGO_URL}" alt="Sellfor1Percent.com" style="height: 48px; border-radius: 6px;" /></td>
            <td style="text-align: right; vertical-align: middle;">
              <span style="font-size: 22px; font-weight: 700; color: #1f2937;">Appraisal Scheduled</span><br/>
              <span style="font-size: 13px; color: #6b7280;">${escapeHtml(propertyAddress)}</span>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding: 24px 32px;">
          <p style="margin: 16px 0; line-height: 1.6; color: #374151;">Hey ${escapeHtml(sellerFirstNames)},</p>
          ${appointmentLine}
          <p style="margin: 16px 0; line-height: 1.6; color: #374151;">The appraisal has been scheduled for your home. Nothing for you to do — the appraiser will only be at the house for about 20 minutes. They'll do a walk through, take some pictures, and then the real work for the appraiser begins.</p>
          <p style="margin: 16px 0; line-height: 1.6; color: #374151;">Typically it takes an appraiser 2 to 3 business days to finalize their report, and the only time we hear from the appraiser is if there is a problem with the valuation. Don't worry — I don't think we will have a problem with your property.</p>
          <p style="margin: 16px 0; line-height: 1.6; color: #374151;">If you are still living in the property, you do not need to leave like you would for a showing or a home inspection. I would only caution not to get too chatty with the appraiser about all of the things you have done to the house — what you think adds $1000s of value to the home may actually be looked at as a negative. Only answering the questions the appraiser asks is the best way to handle it while still being friendly.</p>
          <p style="margin: 16px 0; line-height: 1.6; color: #374151;">Let me know if you have any questions.</p>
          <p style="margin: 16px 0 4px; line-height: 1.6; color: #374151;">Thanks</p>
          <p style="margin: 0 0 16px; line-height: 1.6; color: #374151;">${escapeHtml(agentFirstName)}</p>
          ${signatureHtml}
        </td></tr>
        <tr><td style="padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
          <img src="${PUBLIC_LOGO_URL}" alt="Sellfor1Percent.com" style="height: 32px; border-radius: 6px; margin-bottom: 8px;" />
          <p style="margin: 0; font-size: 12px; font-weight: 600; color: #1f2937;">Sellfor1Percent.com</p>
          <p style="margin: 2px 0 0; font-size: 10px; color: #9ca3af;">Full Service Real Estate for just a 1% Commission</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const emailBody: Record<string, unknown> = {
    from: `${fromName} via Sellfor1Percent.com <updates@resend.sellfor1percent.com>`,
    reply_to: replyTo,
    to: toEmails,
    bcc: bccEmail ? [bccEmail] : undefined,
    subject: `Appraisal Scheduled - ${propertyAddress}`,
    html,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(emailBody),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("[Resend error]", result);
    throw new Error(result.message || "Failed to send appraisal email");
  }
  return { id: result.id };
}

async function sendAgentNotification(
  supabase: any,
  agentEmail: string,
  reason: string,
  sourceSubject: string,
  parsed: ParsedAppraisalEmail,
  matchedClient: any | null,
): Promise<void> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY || !agentEmail) {
    console.warn("Cannot send agent notification: missing RESEND_API_KEY or agent email");
    return;
  }

  const clientInfo = matchedClient
    ? `<p><strong>Matched client:</strong> ${escapeHtml((matchedClient.first_name || "") + " " + (matchedClient.last_name || ""))} (ID: ${matchedClient.id})</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; padding: 24px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="max-width: 640px; width: 100%; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">
        <tr><td style="padding: 24px 32px; background: #fef3c7; border-bottom: 1px solid #fde68a; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #92400e; font-size: 20px;">⚠️ Auto-email skipped: APPRAISAL CONFIRMED</h2>
          <p style="margin: 8px 0 0; color: #78350f; font-size: 14px;">No email was sent to the client. Please review and send manually if appropriate.</p>
        </td></tr>
        <tr><td style="padding: 24px 32px; color: #374151; line-height: 1.6;">
          <p><strong>Reason skipped:</strong></p>
          <p style="background: #f3f4f6; padding: 12px; border-left: 3px solid #ef4444; border-radius: 4px;">${escapeHtml(reason)}</p>

          <p style="margin-top: 24px;"><strong>Original email:</strong></p>
          <p style="background: #f3f4f6; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 13px;">${escapeHtml(sourceSubject)}</p>

          <p style="margin-top: 24px;"><strong>What we extracted:</strong></p>
          <ul style="margin: 8px 0; padding-left: 20px;">
            <li>Property address (subject): ${escapeHtml(parsed.subjectAddress || "(not parsed)")}</li>
            <li>Property address (body): ${escapeHtml(parsed.bodyAddress || "(not parsed)")}</li>
            <li>Appraisal date/time: ${escapeHtml(parsed.appraisalDateTime || "(not parsed)")}</li>
            <li>MLS ID: ${escapeHtml(parsed.mlsId || "(not parsed)")}</li>
            <li>Presented by: ${escapeHtml(parsed.presentedBy || "(not parsed)")}</li>
            <li>Listing contact emails in body: ${parsed.listingContactEmails.length > 0 ? escapeHtml(parsed.listingContactEmails.join(", ")) : "(none found)"}</li>
            <li>Appraiser: ${escapeHtml(parsed.appraiserName || "(not parsed)")} ${parsed.appraiserCompany ? `(${escapeHtml(parsed.appraiserCompany)})` : ""}</li>
          </ul>

          ${clientInfo}

          <p style="margin-top: 24px; font-size: 13px; color: #6b7280;">You can review all auto-email activity in the dashboard under <strong>Auto-Email Log</strong>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Sellfor1Percent Auto-Email <updates@resend.sellfor1percent.com>",
        to: [agentEmail],
        subject: `⚠️ Auto-email skipped: APPRAISAL CONFIRMED for ${parsed.subjectAddress || "(unknown)"}`,
        html,
      }),
    });
    console.log(`Sent agent notification to ${agentEmail}`);
  } catch (err) {
    console.error("Failed to send agent notification:", err);
  }
}

async function logSkip(
  supabase: any,
  agent_id: string,
  gmail_message_id: string,
  subject: string,
  reason: string,
  parsed: any,
  client_id: string | null = null,
): Promise<void> {
  await supabase.from("auto_email_log").insert({
    agent_id,
    gmail_message_id,
    keyword: KEYWORD,
    status: "skipped",
    reason,
    parsed_data: parsed,
    client_id,
    source_subject: subject,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
