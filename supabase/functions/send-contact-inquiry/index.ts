import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, message, address, agentName } = await req.json();

    if (!name || !email || !message) {
      throw new Error('Name, email, and message are required');
    }

    const emailResponse = await resend.emails.send({
      from: 'Sell for 1 Percent <updates@resend.sellfor1percent.com>',
      to: ['dave@sellfor1percent.com'],
      reply_to: email,
      subject: `New Inquiry: ${address || 'Property Listing'}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; font-size: 15px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a; margin-bottom: 8px;">New Property Inquiry</h2>
          <p style="color: #666; margin-top: 0;">From your listings website</p>
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
          <p><strong>Property:</strong> ${address || 'Not specified'}</p>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          ${phone ? `<p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;" />
          <p><strong>Message:</strong></p>
          <p style="background: #f9f9f9; padding: 12px; border-radius: 6px;">${message.replace(/\n/g, '<br>')}</p>
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
