import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Attachment {
  filename: string;
  content: string; // base64
}

interface OfferLetterEmailPayload {
  to_email: string;
  from_name: string;
  reply_to: string;
  client_name: string;
  street_address: string;
  letter_text: string;
  agent_first_name?: string;
  agent_full_name?: string;
  agent_phone?: string;
  agent_email?: string;
  agent_bio?: string;
  preview_only?: boolean;
  attachments?: Attachment[];
}

const PUBLIC_LOGO_URL = 'https://ujhohggsvijjqoatvwnl.supabase.co/storage/v1/object/public/email-assets/logo.jpg';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: OfferLetterEmailPayload = await req.json();
    const {
      to_email, from_name, reply_to,
      client_name, street_address, letter_text,
      agent_first_name, agent_full_name, agent_phone, agent_email, agent_bio,
      preview_only, attachments,
    } = payload;

    const signoff = agent_first_name || from_name || 'Your Agent';

    // Build agent signature
    let signatureHtml = '';
    if (agent_bio && /<[a-z][\s\S]*>/i.test(agent_bio)) {
      signatureHtml = agent_bio.replace(/<P>/gi, '<br><br>');
    } else if (agent_bio) {
      signatureHtml = `<p style="margin: 0; line-height: 1.6; color: #374151; white-space: pre-line;">${agent_bio}</p>`;
    } else {
      signatureHtml = `
        <p style="margin: 0; color: #374151;">${agent_full_name || from_name || ''}</p>
        ${agent_phone ? `<p style="margin: 0; color: #374151;">cell: ${agent_phone}</p>` : ''}
        ${agent_email ? `<p style="margin: 0; color: #374151;">email: ${agent_email}</p>` : ''}
      `;
    }

    // Escape HTML in letter text and preserve newlines
    const escapedLetterText = letter_text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    // Build attachment info for preview
    const attachmentCount = attachments?.length || 0;
    const attachmentPreviewHtml = attachmentCount > 0 ? `
      <div style="margin-top: 16px; padding: 12px 16px; background: #f3f4f6; border-radius: 8px; border: 1px solid #e5e7eb;">
        <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #374151;">📎 ${attachmentCount} Attachment${attachmentCount > 1 ? 's' : ''}</p>
        ${(attachments || []).map(a => `<p style="margin: 0; font-size: 12px; color: #6b7280;">• ${a.filename}</p>`).join('')}
      </div>
    ` : '';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="max-width: 640px; width: 100%; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">

          <!-- Header with Logo -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <img src="${PUBLIC_LOGO_URL}" alt="Sellfor1Percent.com" style="height: 48px; border-radius: 6px;" />
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <span style="font-size: 22px; font-weight: 700; color: #1f2937;">Offer Letter</span><br/>
                    <span style="font-size: 13px; color: #6b7280;">Notification of offer received</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Letter Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 24px; line-height: 1.7; color: #374151; font-size: 15px;">${escapedLetterText}</p>

              ${signatureHtml}
              ${preview_only ? attachmentPreviewHtml : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center;">
              <img src="${PUBLIC_LOGO_URL}" alt="Sellfor1Percent.com" style="height: 32px; border-radius: 6px; margin-bottom: 8px;" />
              <p style="margin: 0; font-size: 12px; font-weight: 600; color: #1f2937;">Sellfor1Percent.com</p>
              <p style="margin: 2px 0 0; font-size: 10px; color: #9ca3af;">Full Service Real Estate for just a 1% Commission</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    if (preview_only) {
      return new Response(JSON.stringify({ html }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    // Build Resend attachments array
    const resendAttachments = (attachments || []).map(a => ({
      filename: a.filename,
      content: a.content,
    }));

    const emailBody: Record<string, unknown> = {
      from: `${from_name} via Sellfor1Percent.com <updates@resend.sellfor1percent.com>`,
      reply_to: reply_to,
      to: [to_email],
      subject: `We have received an offer for ${street_address}`,
      html: html,
    };

    if (resendAttachments.length > 0) {
      emailBody.attachments = resendAttachments;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailBody),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('[send-offer-letter-email] Resend error:', result);
      throw new Error(result.message || 'Failed to send email');
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[send-offer-letter-email] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
