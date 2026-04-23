import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Simple in-memory rate limiter per IP
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 3;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

const FALLBACK_RECIPIENT = 'dave@sellfor1percent.com';
const BCC_RECIPIENT = 'dave@sellfor1percent.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: unknown): s is string {
  return typeof s === 'string' && s.length <= 255 && EMAIL_RE.test(s);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Capture IP server-side (do not trust client-supplied IP)
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const {
      name,
      email,
      phone,
      message,
      address,
      agentName,
      // New fields
      mlsId,
      streetName,
      listingAgentName,
      listingAgentEmail,
      preferredDate,
    } = body;

    // Server-side validation
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      throw new Error('Invalid name');
    }
    // Email is optional now. If provided, it must be valid.
    const hasEmail = email !== undefined && email !== null && String(email).trim().length > 0 && String(email).trim().toLowerCase() !== 'not provided';
    if (hasEmail && !isValidEmail(String(email).trim())) {
      throw new Error('Invalid email');
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 2000) {
      throw new Error('Invalid message');
    }
    if (phone && (typeof phone !== 'string' || phone.length > 30)) {
      throw new Error('Invalid phone');
    }

    // Sanitize inputs
    const sanitize = (s: string) => s.replace(/[<>&"']/g, (c) => {
      const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
      return map[c] || c;
    });

    const safeName = sanitize(name.trim());
    const safeEmail = hasEmail ? sanitize(String(email).trim()) : '';
    const safePhone = phone ? sanitize(String(phone).trim()) : '';
    const safeMessage = sanitize(message.trim());
    const safeAddress = address ? sanitize(String(address).substring(0, 200)) : 'Not specified';
    const safeAgentName = agentName ? sanitize(String(agentName).substring(0, 120)) : '';
    const safeListingAgentName = listingAgentName ? sanitize(String(listingAgentName).substring(0, 120)) : safeAgentName;
    const safePreferredDate = preferredDate ? sanitize(String(preferredDate).substring(0, 200)) : '';

    // Recipient routing: TO listing agent if valid, CC Dave; else TO Dave
    const cleanedAgentEmail = typeof listingAgentEmail === 'string' ? listingAgentEmail.trim() : '';
    const agentEmailValid = isValidEmail(cleanedAgentEmail);
    const toAddresses: string[] = agentEmailValid ? [cleanedAgentEmail] : [FALLBACK_RECIPIENT];
    const ccAddresses: string[] | undefined = agentEmailValid ? [FALLBACK_RECIPIENT] : undefined;

    const emailPayload: any = {
      from: 'Sell for 1 Percent <updates@resend.sellfor1percent.com>',
      to: toAddresses,
      subject: `New Inquiry: ${safeAddress}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; font-size: 15px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">New Property Inquiry</h2>
          <p style="color: #666; margin-top: 0;">From your listings website</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
          <p><strong>Property:</strong> ${safeAddress}</p>
          ${safeListingAgentName ? `<p><strong>Listing Agent:</strong> ${safeListingAgentName}</p>` : ''}
          <p><strong>Name:</strong> ${safeName}</p>
          ${safeEmail ? `<p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>` : ''}
          ${safePhone ? `<p><strong>Phone:</strong> <a href="tel:${safePhone}">${safePhone}</a></p>` : ''}
          ${safePreferredDate ? `<p><strong>Preferred Date/Time:</strong> ${safePreferredDate}</p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
          <p><strong>Message:</strong></p>
          <p style="background: #f9f9f9; padding: 12px; border-radius: 6px;">${safeMessage.replace(/\n/g, '<br>')}</p>
        </body>
        </html>
      `,
    };
    if (hasEmail) emailPayload.reply_to = String(email).trim();
    if (ccAddresses) emailPayload.cc = ccAddresses;

    const emailResponse = await resend.emails.send(emailPayload);
    console.log('Contact inquiry sent:', { to: toAddresses, cc: ccAddresses, response: emailResponse });

    // Persist inquiry to database (best-effort; do not fail the whole request if this errors)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceRoleKey) {
        const supabase = createClient(supabaseUrl, serviceRoleKey);
        const cleanStreet = streetName
          ? String(streetName).substring(0, 200)
          : (address ? String(address).split(',')[0]?.trim().substring(0, 200) : null);

        const { error: insertError } = await supabase
          .from('listing_inquiries')
          .insert({
            property_street: cleanStreet,
            mls_id: mlsId ? String(mlsId).substring(0, 100) : null,
            listing_agent_name: listingAgentName ? String(listingAgentName).substring(0, 200) : null,
            listing_agent_email: agentEmailValid ? cleanedAgentEmail : (listingAgentEmail ? String(listingAgentEmail).substring(0, 255) : null),
            inquirer_name: name.trim().substring(0, 200),
            inquirer_phone: phone ? String(phone).trim().substring(0, 50) : null,
            inquirer_email: hasEmail ? String(email).trim().substring(0, 255) : null,
            requested_date: preferredDate ? String(preferredDate).substring(0, 500) : null,
            inquirer_ip: clientIp.substring(0, 100),
          });
        if (insertError) {
          console.error('Failed to insert listing_inquiry:', insertError);
        }
      } else {
        console.warn('Supabase service role credentials missing; skipping inquiry persistence.');
      }
    } catch (persistErr) {
      console.error('Error persisting inquiry:', persistErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending contact inquiry:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
