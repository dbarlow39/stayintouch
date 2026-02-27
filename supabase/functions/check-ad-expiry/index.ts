import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Find ads that have ended (boost_started_at + duration_days < now) and are still 'active' or 'boosted'
    const { data: activePosts, error } = await supabase
      .from('facebook_ad_posts')
      .select('*, agent_id')
      .in('status', ['active', 'boosted'])
      .gt('duration_days', 0);

    if (error) {
      console.error('[check-ad-expiry] DB error:', error);
      throw error;
    }

    const now = new Date();
    const expiredPosts = (activePosts || []).filter(post => {
      const start = new Date(post.boost_started_at);
      const endDate = new Date(start.getTime() + post.duration_days * 86400000);
      return now >= endDate;
    });

    console.log(`[check-ad-expiry] Found ${expiredPosts.length} expired ads out of ${activePosts?.length || 0} active`);

    if (expiredPosts.length === 0) {
      return new Response(JSON.stringify({ expired: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark them as 'ended'
    const expiredIds = expiredPosts.map(p => p.id);
    await supabase
      .from('facebook_ad_posts')
      .update({ status: 'ended' })
      .in('id', expiredIds);

    // Group by agent for email notifications
    const agentGroups: Record<string, typeof expiredPosts> = {};
    for (const post of expiredPosts) {
      if (!agentGroups[post.agent_id]) agentGroups[post.agent_id] = [];
      agentGroups[post.agent_id].push(post);
    }

    // Send email notifications per agent
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    let emailsSent = 0;

    if (RESEND_API_KEY) {
      for (const [agentId, posts] of Object.entries(agentGroups)) {
        // Get agent profile for email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, preferred_email, first_name, full_name')
          .eq('id', agentId)
          .maybeSingle();

        const toEmail = profile?.preferred_email || profile?.email;
        if (!toEmail) {
          console.log(`[check-ad-expiry] No email for agent ${agentId}, skipping`);
          continue;
        }

        const agentName = profile?.first_name || profile?.full_name || 'there';
        const listingList = posts
          .map(p => `• ${p.listing_address} (ran ${p.duration_days} days, $${p.daily_budget}/day)`)
          .join('\n');

        const totalSpent = posts.reduce((sum, p) => sum + (p.daily_budget * p.duration_days), 0);

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#1f2937;font-size:20px;">Facebook Ad${posts.length > 1 ? 's' : ''} Completed</h2>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Hi ${agentName},</p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            The following Facebook ad${posts.length > 1 ? 's have' : ' has'} finished running:
          </p>
          ${posts.map(p => {
            const startDate = new Date(p.boost_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endDate = new Date(new Date(p.boost_started_at).getTime() + p.duration_days * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:8px;">
            <p style="margin:0;font-weight:600;color:#1f2937;font-size:14px;">${p.listing_address}</p>
            <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${startDate} – ${endDate} · ${p.duration_days} days · $${(p.daily_budget * p.duration_days).toFixed(0)} total spend</p>
          </div>`;
          }).join('')}
          <p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;">
            View the results for ${posts.length > 1 ? 'these ads' : 'this ad'} in your <strong>Ad Results</strong> dashboard.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;font-weight:600;color:#1f2937;">Sellfor1Percent.com</p>
          <p style="margin:2px 0 0;font-size:10px;color:#9ca3af;">Full Service Real Estate for just a 1% Commission</p>
        </td></tr>
      </table>
    </td></tr>
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
            from: 'Sellfor1Percent.com <updates@resend.sellfor1percent.com>',
            to: [toEmail],
            subject: `Facebook Ad${posts.length > 1 ? 's' : ''} Completed – ${posts.length > 1 ? `${posts.length} listings` : posts[0].listing_address}`,
            html,
          }),
        });

        if (res.ok) {
          emailsSent++;
          console.log(`[check-ad-expiry] Email sent to ${toEmail} for ${posts.length} ended ads`);
        } else {
          const err = await res.text();
          console.error(`[check-ad-expiry] Email failed for ${toEmail}:`, err);
        }
      }
    } else {
      console.log('[check-ad-expiry] No RESEND_API_KEY, skipping email notifications');
    }

    return new Response(JSON.stringify({ 
      expired: expiredPosts.length, 
      emails_sent: emailsSent,
      ended_addresses: expiredPosts.map(p => p.listing_address),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[check-ad-expiry] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
