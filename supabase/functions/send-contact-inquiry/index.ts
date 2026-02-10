import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limit by IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(clientIp)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { name, email, phone, message, address, agentName } = body;

    // Server-side validation
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      throw new Error('Invalid name');
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
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
    const safeEmail = sanitize(email.trim());
    const safePhone = phone ? sanitize(phone.trim()) : '';
    const safeMessage = sanitize(message.trim());
    const safeAddress = address ? sanitize(String(address).substring(0, 200)) : 'Not specified';

    const emailResponse = await resend.emails.send({
      from: 'Sell for 1 Percent <updates@resend.sellfor1percent.com>',
      to: ['dave@sellfor1percent.com'],
      reply_to: email.trim(),
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
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
          ${safePhone ? `<p><strong>Phone:</strong> <a href="tel:${safePhone}">${safePhone}</a></p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
          <p><strong>Message:</strong></p>
          <p style="background: #f9f9f9; padding: 12px; border-radius: 6px;">${safeMessage.replace(/\n/g, '<br>')}</p>
        </body>
        </html>
      `,
    });

    console.log('Contact inquiry sent:', emailResponse);

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
