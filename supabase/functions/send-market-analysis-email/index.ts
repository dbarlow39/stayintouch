import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_LOGO_URL = 'https://ujhohggsvijjqoatvwnl.supabase.co/storage/v1/object/public/email-assets/logo.jpg';

function formatCurrency(val: string | number): string {
  if (typeof val === 'string') return val;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const {
      to_emails,
      from_name,
      reply_to,
      buyer_names,
      analysis,
      agent_first_name,
      agent_bio,
      agent_full_name,
      agent_phone,
      agent_email,
      preview_only,
    } = payload;

    const prop = analysis?.property;
    const pricing = analysis?.pricing;
    const narrative = analysis?.narrative;
    const closedComps = analysis?.closedComps || [];
    const features = analysis?.features || [];

    const greeting = buyer_names || 'there';
    const signoff = agent_first_name || from_name || 'Your Agent';
    const address = prop ? `${prop.address}, ${prop.city}, ${prop.state} ${prop.zip}` : 'Subject Property';

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

    // Build features list
    const featuresHtml = features.length > 0
      ? features.map((f: string) => `<li style="margin-bottom: 4px; color: #374151; font-size: 14px;">${f}</li>`).join('')
      : '';

    // Build comps table rows
    const compsRowsHtml = closedComps.map((comp: any, i: number) => `
      <tr style="background-color: ${i % 2 === 1 ? '#FDECEA' : '#ffffff'};">
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb;">${comp.address || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb;">${comp.closedDate || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">${comp.listPrice || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">${comp.soldPrice || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: center;">${comp.beds || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: center;">${comp.baths || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">${comp.sqFt || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: center;">${comp.yearBuilt || ''}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: #374151; border-bottom: 1px solid #e5e7eb; text-align: right;">${comp.dom || ''}</td>
      </tr>
    `).join('');

    // Property overview rows
    const propRows = prop ? [
      ['Address', address],
      ['Owner(s)', [prop.owner1, prop.owner2].filter(Boolean).join(' and ')],
      ['Style', prop.style],
      ['Beds / Baths', `${prop.bedrooms} / ${prop.baths}`],
      ['Above-Grade Sq Ft', prop.aboveGradeSqFt],
      ['Basement Sq Ft', prop.basementSqFt],
      ['Total Finished Sq Ft', prop.totalFinishedSqFt],
      ['Year Built', prop.yearBuilt],
      ['Zestimate', prop.zestimate],
    ].filter(([, v]) => v).map(([label, value]) => `
      <tr>
        <td style="padding: 6px 12px; font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 1px solid #f3f4f6; width: 180px;">${label}</td>
        <td style="padding: 6px 12px; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6;">${value}</td>
      </tr>
    `).join('') : '';

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
        <table width="680" cellpadding="0" cellspacing="0" style="max-width: 680px; width: 100%; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <img src="${PUBLIC_LOGO_URL}" alt="Sellfor1Percent.com" style="height: 48px; border-radius: 6px;" />
                  </td>
                  <td style="text-align: right; vertical-align: middle;">
                    <span style="font-size: 20px; font-weight: 700; color: #8B0000;">Buyer Market Analysis</span><br/>
                    <span style="font-size: 13px; color: #6b7280;">${address}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="padding: 24px 32px;">
              <p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 15px;">Dear ${greeting},</p>
              ${narrative?.intro ? `<p style="margin: 0 0 24px; line-height: 1.6; color: #374151; font-size: 15px;">${narrative.intro}</p>` : ''}
            </td>
          </tr>

          <!-- Property Overview -->
          ${propRows ? `
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #8B0000;">Property Overview</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; border-collapse: collapse;">
                ${propRows}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Features -->
          ${featuresHtml ? `
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #8B0000;">Notable Property Features</p>
              <ul style="margin: 0; padding-left: 20px;">
                ${featuresHtml}
              </ul>
            </td>
          </tr>
          ` : ''}

          <!-- Comparable Sales -->
          ${closedComps.length > 0 ? `
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #8B0000;">Recent Comparable Sales</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 8px; border-collapse: collapse;">
                <tr style="background-color: #CC0000;">
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: left; font-weight: 600;">Address</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: left; font-weight: 600;">Closed</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: right; font-weight: 600;">List Price</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: right; font-weight: 600;">Sold Price</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: center; font-weight: 600;">Beds</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: center; font-weight: 600;">Baths</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: right; font-weight: 600;">Sq Ft</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: center; font-weight: 600;">Year</th>
                  <th style="padding: 6px 8px; font-size: 11px; color: #ffffff; text-align: right; font-weight: 600;">DOM</th>
                </tr>
                ${compsRowsHtml}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Pricing Section -->
          ${pricing ? (pricing.lowPrice ? `
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #8B0000;">Buyer's Purchase Range</p>
              ${narrative?.purchaseRangeExplain ? `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.purchaseRangeExplain}</p>` : ''}
              ${narrative?.bracketAnalysis ? `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.bracketAnalysis}</p>` : ''}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td style="text-align: center; padding: 12px; vertical-align: top; background-color: #FDECEA; border: 2px solid #CC0000; border-radius: 8px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 600; color: #CC0000;">LOW</p>
                    <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #8B0000;">${pricing.lowPrice || ''}</p>
                  </td>
                  <td style="width: 24px;"></td>
                  <td style="text-align: center; padding: 12px; vertical-align: top; background-color: #FDECEA; border: 2px solid #CC0000; border-radius: 8px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 600; color: #CC0000;">HIGH</p>
                    <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #8B0000;">${pricing.highPrice || ''}</p>
                  </td>
                </tr>
              </table>
              ${narrative?.priceJustification ? `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.priceJustification}</p>` : ''}
            </td>
          </tr>
          ` : `
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #8B0000;">Bullseye Pricing Strategy</p>
              ${narrative?.bullseyeExplain ? `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.bullseyeExplain}</p>` : ''}
              ${narrative?.bracketAnalysis ? `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.bracketAnalysis}</p>` : ''}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td style="text-align: center; padding: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 11px; color: #6b7280;">Lower Bracket</p>
                    <p style="margin: 4px 0 0; font-size: 18px; font-weight: 600; color: #374151;">${pricing.lowerBracketPrice || ''}</p>
                  </td>
                  <td style="text-align: center; padding: 12px; vertical-align: top; background-color: #FDECEA; border: 2px solid #CC0000; border-radius: 8px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 600; color: #CC0000;">★ BULLSEYE</p>
                    <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #8B0000;">${pricing.bullseyePrice || ''}</p>
                  </td>
                  <td style="text-align: center; padding: 12px; vertical-align: top;">
                    <p style="margin: 0; font-size: 11px; color: #6b7280;">Upper Bracket</p>
                    <p style="margin: 4px 0 0; font-size: 18px; font-weight: 600; color: #374151;">${pricing.upperBracketPrice || ''}</p>
                  </td>
                </tr>
              </table>
              ${narrative?.priceJustification ? `<p style="margin: 0 0 16px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.priceJustification}</p>` : ''}
            </td>
          </tr>
          `) : ''}

          <!-- Next Steps -->
          ${narrative?.nextSteps ? `
          <tr>
            <td style="padding: 0 32px 24px;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #8B0000;">Next Steps</p>
              <p style="margin: 0 0 24px; line-height: 1.6; color: #374151; font-size: 14px;">${narrative.nextSteps}</p>
            </td>
          </tr>
          ` : ''}

          <!-- Signature -->
          <tr>
            <td style="padding: 0 32px 24px;">
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

    if (preview_only) {
      return new Response(JSON.stringify({ html }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    // Send to all provided emails
    const emails = Array.isArray(to_emails) ? to_emails : [to_emails];
    const results = [];
    for (const email of emails) {
      if (!email || !email.trim()) continue;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${from_name} via Sellfor1Percent.com <updates@resend.sellfor1percent.com>`,
          reply_to: reply_to,
          to: [email.trim()],
          subject: `Buyer Market Analysis - ${prop?.address || 'Property Analysis'}`,
          html: html,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        console.error('[send-market-analysis-email] Resend error:', result);
        throw new Error(result.message || `Failed to send email to ${email}`);
      }
      results.push({ email: email.trim(), id: result.id });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[send-market-analysis-email] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
