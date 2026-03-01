import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CostRow {
  label: string;
  amount: number;
}

interface EstimatedNetEmailPayload {
  to_email: string;
  from_name: string;
  reply_to: string;
  client_name: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
  closing_date: string | null;
  cost_rows: CostRow[];
  estimated_net: number;
  logo_url: string;
  preview_only?: boolean;
  client_first_names?: string;
  agent_first_name?: string;
  agent_full_name?: string;
  agent_phone?: string;
  agent_email?: string;
  agent_bio?: string;
  intro_text?: string;
  closing_text?: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

const PUBLIC_LOGO_URL = 'https://ujhohggsvijjqoatvwnl.supabase.co/storage/v1/object/public/email-assets/logo.jpg';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: EstimatedNetEmailPayload = await req.json();
    const {
      to_email, from_name, reply_to,
      client_name, street_address, city, state, zip, closing_date,
      cost_rows, estimated_net, logo_url,
      preview_only,
      client_first_names, agent_first_name, agent_full_name, agent_phone, agent_email, agent_bio,
      intro_text, closing_text,
    } = payload;

    const greeting = client_first_names || 'there';
    const signoff = agent_first_name || from_name || 'Your Agent';

    // Build cost rows HTML
    const costRowsHtml = cost_rows
      .map(row => `
        <tr>
          <td style="padding: 8px 12px; font-size: 14px; color: #374151; border-bottom: 1px solid #e5e7eb;">${row.label}</td>
          <td style="padding: 8px 12px; font-size: 14px; color: #374151; text-align: right; border-bottom: 1px solid #e5e7eb;">${formatCurrency(row.amount)}</td>
        </tr>`)
      .join('');

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

    const closingDateFormatted = closing_date
      ? new Date(closing_date + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
      : null;

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
                    <span style="font-size: 22px; font-weight: 700; color: #1f2937;">Estimated Net</span><br/>
                    <span style="font-size: 13px; color: #6b7280;">A Breakdown of Your Expenses</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Property Info -->
          <tr>
            <td style="padding: 24px 32px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin: 0 0 4px; font-size: 18px; font-weight: 600; color: #1f2937;">${client_name}</p>
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">${street_address}</p>
                    <p style="margin: 0; font-size: 14px; color: #6b7280;">${city}, ${state} ${zip}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Letter Body -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="margin: 0 0 24px; line-height: 1.6; color: #374151; font-size: 15px; white-space: pre-line;">${intro_text || `Hi ${greeting},\n\nBelow is an estimated breakdown of the closing costs for your property. Please note that these are estimates and the actual amounts may vary at closing.`}</p>

              ${closingDateFormatted ? `<p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #1f2937; text-align: right;">Estimated Closing Date: ${closingDateFormatted}</p>` : ''}
              <!-- Cost Breakdown Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px;">
                ${costRowsHtml}
                <tr style="border-top: 2px solid #16a34a;">
                  <td style="padding: 12px; font-size: 16px; font-weight: 700; color: #1f2937;">Estimated Net</td>
                  <td style="padding: 12px; font-size: 16px; font-weight: 700; color: #16a34a; text-align: right;">${formatCurrency(estimated_net)}</td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 15px; white-space: pre-line;">${closing_text || 'Once you have had a chance to review please let me know if you have any questions. Once again thanks for your time and I look forward to working you in the near future.'}</p>

              <p style="margin: 0 0 8px; line-height: 1.6; color: #374151; font-size: 15px;">Thanks</p>
              <p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 15px;">${signoff}</p>
              ${signatureHtml}
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

    // If preview only, return the HTML without sending
    if (preview_only) {
      return new Response(JSON.stringify({ html }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${from_name} via Sellfor1Percent.com <updates@resend.sellfor1percent.com>`,
        reply_to: reply_to,
        to: [to_email],
        subject: `Estimated Net - ${street_address}`,
        html: html,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('[send-estimated-net-email] Resend error:', result);
      throw new Error(result.message || 'Failed to send email');
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[send-estimated-net-email] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
