import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdResultsEmailPayload {
  to_email: string;
  from_name: string;
  reply_to: string;
  listing_address: string;
  post_date: string;
  post_engagements: number;
  cost_per_engagement: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  amount_spent: number;
  activity_items: { label: string; value: number }[];
  ad_preview_image: string | null;
  ad_preview_text: string | null;
  facebook_post_url: string;
  logo_url: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const payload: AdResultsEmailPayload = await req.json();
    const {
      to_email, from_name, reply_to, listing_address, post_date,
      post_engagements, cost_per_engagement, views, reach,
      likes, comments, shares, amount_spent, activity_items,
      ad_preview_image, ad_preview_text, facebook_post_url, logo_url,
    } = payload;

    // Build activity rows HTML
    const maxActivity = activity_items.length > 0 ? Math.max(...activity_items.map(a => a.value)) : 1;
    const activityHtml = activity_items.map(item => {
      const pct = Math.max(Math.round((item.value / maxActivity) * 100), 5);
      return `
        <tr>
          <td style="padding: 6px 0; font-size: 13px; color: #6b7280; width: 140px; text-transform: capitalize;">${item.label}</td>
          <td style="padding: 6px 0;">
            <div style="background: #f3f4f6; border-radius: 4px; height: 22px; width: 100%;">
              <div style="background: #3b82f6; border-radius: 4px; height: 22px; width: ${pct}%;"></div>
            </div>
          </td>
          <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #1f2937; text-align: right; width: 50px;">${item.value.toLocaleString()}</td>
        </tr>`;
    }).join('');

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
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 20px 24px; background: #ffffff; border-radius: 12px 12px 0 0; border-bottom: 1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    ${logo_url ? `<img src="${logo_url}" alt="Sellfor1Percent.com" style="height: 40px; border-radius: 6px;" />` : ''}
                  </td>
                  <td style="text-align: right;">
                    <span style="font-size: 18px; font-weight: 700; color: #1f2937;">Ad Results</span><br/>
                    <span style="font-size: 11px; color: #9ca3af;">Sellfor1Percent.com</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Property & Date -->
          <tr>
            <td style="padding: 20px 24px 12px; background: #ffffff;">
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">${listing_address}</p>
              <p style="margin: 4px 0 0; font-size: 12px; color: #9ca3af;">Posted ${post_date}</p>
            </td>
          </tr>

          <!-- Performance Metrics -->
          <tr>
            <td style="padding: 12px 24px; background: #ffffff;">
              <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #1f2937;">Performance</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding-right: 6px; padding-bottom: 8px;">
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px;">
                      <p style="margin: 0; font-size: 11px; color: #6b7280;">Post Engagements</p>
                      <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #1f2937;">${post_engagements.toLocaleString()}</p>
                    </div>
                  </td>
                  <td width="50%" style="padding-left: 6px; padding-bottom: 8px;">
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px;">
                      <p style="margin: 0; font-size: 11px; color: #6b7280;">Cost per Engagement</p>
                      <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #1f2937;">$${cost_per_engagement}</p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding-right: 6px;">
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px;">
                      <p style="margin: 0; font-size: 11px; color: #6b7280;">Views</p>
                      <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #1f2937;">${views.toLocaleString()}</p>
                    </div>
                  </td>
                  <td width="50%" style="padding-left: 6px;">
                    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px;">
                      <p style="margin: 0; font-size: 11px; color: #6b7280;">Reach</p>
                      <p style="margin: 4px 0 0; font-size: 24px; font-weight: 700; color: #1f2937;">${reach.toLocaleString()}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Activity Breakdown -->
          ${activity_items.length > 0 ? `
          <tr>
            <td style="padding: 16px 24px; background: #ffffff;">
              <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #1f2937;">Activity</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${activityHtml}
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- Engagement -->
          <tr>
            <td style="padding: 16px 24px; background: #ffffff;">
              <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #1f2937;">Engagement</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center; padding: 8px;">
                    <span style="font-size: 20px; font-weight: 700; color: #1f2937;">${likes}</span><br/>
                    <span style="font-size: 11px; color: #6b7280;">❤️ Likes</span>
                  </td>
                  <td style="text-align: center; padding: 8px;">
                    <span style="font-size: 20px; font-weight: 700; color: #1f2937;">${comments}</span><br/>
                    <span style="font-size: 11px; color: #6b7280;">💬 Comments</span>
                  </td>
                  <td style="text-align: center; padding: 8px;">
                    <span style="font-size: 20px; font-weight: 700; color: #1f2937;">${shares}</span><br/>
                    <span style="font-size: 11px; color: #6b7280;">🔗 Shares</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Ad Preview -->
          ${(ad_preview_image || ad_preview_text) ? `
          <tr>
            <td style="padding: 16px 24px; background: #ffffff;">
              <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: #1f2937;">Ad Preview</p>
              <div style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                ${ad_preview_image ? `<img src="${ad_preview_image}" alt="Ad" style="width: 100%; display: block;" />` : ''}
                ${ad_preview_text ? `<div style="padding: 12px; font-size: 12px; color: #374151; line-height: 1.5; white-space: pre-wrap;">${ad_preview_text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- View on Facebook -->
          <tr>
            <td style="padding: 16px 24px; background: #ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${facebook_post_url}" target="_blank" style="display: inline-block; padding: 10px 24px; background: #1877f2; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 6px;">View on Facebook</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 24px; background: #ffffff; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb; text-align: center;">
              ${logo_url ? `<img src="${logo_url}" alt="Sellfor1Percent.com" style="height: 32px; border-radius: 6px; margin-bottom: 8px;" />` : ''}
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
        subject: `Facebook Ad Results - ${listing_address}`,
        html: html,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error('[send-ad-results-email] Resend error:', result);
      throw new Error(result.message || 'Failed to send email');
    }

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[send-ad-results-email] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
