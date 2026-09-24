import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportPdf } from "./buildReportPdf.ts";

const ACTION_LABELS: Record<string, string> = {
  post_engagement: 'Post engagements',
  link_click: 'Link clicks',
  post_reaction: 'Post reactions',
  post: 'Post shares',
  like: 'Facebook likes',
  'onsite_conversion.post_save': 'Post saves',
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const slugify = (s: string) =>
  (s || 'listing').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://stayintouch.lovable.app';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Optional sample mode: build + email the completion report for one post
    let samplePostId: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        samplePostId = body?.sample_post_id ?? null;
      } catch {
        samplePostId = null;
      }
    }

    let expiredPosts: any[] = [];
    const discoveryErrors: { agentId: string; message: string }[] = [];
    const pendingUpdates: Record<string, Record<string, unknown>> = {};
    const MAX_PER_RUN = 5;

    if (samplePostId) {
      const { data: sampleRows, error: sampleErr } = await supabase
        .from('facebook_ad_posts')
        .select('*, agent_id')
        .eq('post_id', samplePostId)
        .limit(1);
      if (sampleErr) throw sampleErr;
      if (!sampleRows || sampleRows.length === 0) {
        return new Response(JSON.stringify({ error: 'sample_post_id not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      expiredPosts = sampleRows;
      console.log(`[check-ad-expiry] SAMPLE mode for post ${samplePostId} — no status changes`);
    } else {
      // ---- Part A: discover boosts made directly in Facebook (Meta Ads) ----
      const lookbackDays = 7;
      const nowMs = Date.now();
      const sinceMs = nowMs - lookbackDays * 86400000;
      const { data: tokenRows } = await supabase
        .from('facebook_oauth_tokens')
        .select('agent_id, access_token, page_access_token, ad_account_id');

      for (const t of tokenRows || []) {
        const acct = t.ad_account_id;
        if (!acct) { discoveryErrors.push({ agentId: t.agent_id, message: 'No Facebook ad account is saved for your connection.' }); continue; }
        let ads: any[] | null = null;
        let lastErr = '';
        for (const token of [t.access_token, t.page_access_token].filter(Boolean)) {
          try {
            const collected: any[] = [];
            let url: string | null = `https://graph.facebook.com/v25.0/act_${acct}/ads?fields=id,campaign_id,creative{effective_object_story_id},adset{start_time,end_time}&limit=200&access_token=${token}`;
            let pages = 0;
            while (url && pages < 10) {
              const r = await fetch(url);
              const j = await r.json();
              if (!r.ok || j.error) throw new Error(j?.error?.message || `HTTP ${r.status}`);
              collected.push(...(j.data || []));
              url = j.paging?.next || null;
              pages++;
            }
            ads = collected;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : String(e);
          }
        }
        if (!ads) {
          console.error(`[check-ad-expiry] Ad account read failed for ${t.agent_id}: ${lastErr}`);
          discoveryErrors.push({ agentId: t.agent_id, message: `Facebook refused access to your ad account: ${lastErr}` });
          continue;
        }

        // Latest end per boosted post, only boosts that ended within the lookback window
        const endedByStory: Record<string, { ad: any; start: string; end: string }> = {};
        for (const ad of ads) {
          const story = ad.creative?.effective_object_story_id;
          const end = ad.adset?.end_time;
          if (!story || !end) continue;
          const endMs = new Date(end).getTime();
          if (isNaN(endMs) || endMs > nowMs || endMs < sinceMs) continue;
          const prev = endedByStory[story];
          if (!prev || new Date(prev.end).getTime() < endMs) {
            endedByStory[story] = { ad, start: ad.adset?.start_time, end };
          }
        }
        console.log(`[check-ad-expiry] Agent ${t.agent_id}: ${ads.length} ads read, ${Object.keys(endedByStory).length} boosts ended in last ${lookbackDays} days`);

        for (const [story, info] of Object.entries(endedByStory)) {
          const { data: rows } = await supabase
            .from('facebook_ad_posts')
            .select('*')
            .eq('agent_id', t.agent_id)
            .eq('post_id', story)
            .order('created_at', { ascending: false })
            .limit(1);
          const row = rows?.[0];
          if (!row) { console.log(`[check-ad-expiry] No listing post matches ${story}, skipping`); continue; }
          // Already reported for this boost?
          if (row.status === 'ended' && row.ad_id === info.ad.id) continue;
          const startMs = new Date(info.start).getTime();
          const duration = isNaN(startMs) ? 0 : Math.max(1, Math.round((new Date(info.end).getTime() - startMs) / 86400000));
          const updates = {
            status: 'ended',
            ad_id: info.ad.id,
            campaign_id: info.ad.campaign_id || row.campaign_id,
            boost_started_at: isNaN(startMs) ? row.boost_started_at : info.start,
            duration_days: duration,
          };
          // Saved only after the report email is accepted, so a failed run retries next time
          pendingUpdates[row.id] = updates;
          expiredPosts.push({ ...row, ...updates });
        }
      }

      // ---- Part B: boosts made through this app ----
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
      const appExpired = (activePosts || []).filter(post => {
        const start = new Date(post.boost_started_at);
        const endDate = new Date(start.getTime() + post.duration_days * 86400000);
        return now >= endDate;
      });

      if (appExpired.length > 0) {
        await supabase
          .from('facebook_ad_posts')
          .update({ status: 'ended' })
          .in('id', appExpired.map(p => p.id));
        expiredPosts.push(...appExpired);
      }

      console.log(`[check-ad-expiry] Found ${expiredPosts.length} ended ads, ${discoveryErrors.length} ad-account errors`);

      // Alert the agent if we couldn't read their ad account
      const RESEND = Deno.env.get('RESEND_API_KEY');
      for (const de of discoveryErrors) {
        if (!RESEND) break;
        const { data: prof } = await supabase.from('profiles').select('email, preferred_email, first_name').eq('id', de.agentId).maybeSingle();
        const to = prof?.preferred_email || prof?.email;
        if (!to) continue;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Sellfor1Percent.com <updates@resend.sellfor1percent.com>',
            to: [to],
            subject: "Couldn't check your Facebook ads today",
            html: `<p>Hi ${prof?.first_name || 'there'},</p><p>This morning's ad check couldn't read your Facebook ad account, so finished-ad reports may be missing.</p><p><b>Reason from Facebook:</b> ${de.message.replace(/</g, '&lt;')}</p><p>Reconnecting Facebook in the Marketing tab usually fixes this.</p>`,
          }),
        }).catch((e) => console.error('[check-ad-expiry] Alert email failed:', e));
      }

      if (expiredPosts.length > MAX_PER_RUN) {
        console.log(`[check-ad-expiry] Capping to ${MAX_PER_RUN}; ${expiredPosts.length - MAX_PER_RUN} left for next run`);
        expiredPosts = expiredPosts.slice(0, MAX_PER_RUN);
      }

      if (expiredPosts.length === 0) {
        return new Response(JSON.stringify({ expired: 0, ad_account_errors: discoveryErrors }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // One email per ended ad (keeps each run fast and each report forwardable)
    const agentGroups: Record<string, typeof expiredPosts> = {};
    for (const post of expiredPosts) {
      agentGroups[`${post.agent_id}|${post.id}`] = [post];
    }

    // Send email notifications per agent
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    let emailsSent = 0;

    if (RESEND_API_KEY) {
      for (const [groupKey, posts] of Object.entries(agentGroups)) {
        const agentId = groupKey.split('|')[0];
        // Get agent profile for email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, preferred_email, first_name, last_name, full_name, cell_phone')
          .eq('id', agentId)
          .maybeSingle();

        const toEmail = profile?.preferred_email || profile?.email;
        if (!toEmail) {
          console.log(`[check-ad-expiry] No email for agent ${agentId}, skipping`);
          continue;
        }

        const agentName = profile?.first_name || profile?.full_name || 'there';

        // Pull final Facebook numbers for each ended ad (best effort)
        const insightsByPost: Record<string, any> = {};
        for (const p of posts) {
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/facebook-ad-insights`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                agent_id: agentId,
                post_id: p.post_id,
                listing_address: p.listing_address,
              }),
            });
            const j = await r.json();
            if (r.ok && !j.error) insightsByPost[p.id] = j;
            else console.error(`[check-ad-expiry] Insights failed for ${p.post_id}:`, j?.error);
          } catch (e) {
            console.error(`[check-ad-expiry] Insights error for ${p.post_id}:`, e);
          }
        }

        // Look up seller first names once for greeting matching
        const { data: agentClients } = await supabase
          .from('clients')
          .select('first_name, street_number, street_name')
          .eq('agent_id', agentId);

        const findClientNames = (address: string) => {
          const addr = (address || '').toLowerCase();
          const match = (agentClients || []).find((c: any) => {
            const key = `${c.street_number || ''} ${c.street_name || ''}`.trim().toLowerCase();
            return key.length > 3 && addr.startsWith(key);
          });
          return match?.first_name || null;
        };

        // Build a PDF report per ended ad (best effort)
        const attachments: { filename: string; content: string }[] = [];
        const pdfFailures: string[] = [];
        for (const p of posts) {
          try {
            const ins = insightsByPost[p.id];
            const startRaw = p.boost_started_at || p.posted_at || p.created_at;
            const startMs = startRaw ? new Date(startRaw).getTime() : NaN;
            const fmtD = (ms: number) => isNaN(ms) ? '' : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const startDate = fmtD(startMs);
            const endDate = (p.duration_days > 0 && !isNaN(startMs)) ? fmtD(startMs + p.duration_days * 86400000) : '';
            const spend = ins?.ad_insights?.spend;

            const activity: { label: string; value: number }[] = [];
            const acts = ins?.ad_insights?.actions;
            if (Array.isArray(acts) && acts.length) {
              for (const a of acts) {
                const label = ACTION_LABELS[a.action_type];
                const value = parseInt(a.value);
                if (label && value > 0) activity.push({ label, value });
              }
            } else if (ins) {
              if (ins.likes > 0) activity.push({ label: 'Reactions', value: ins.likes });
              if (ins.comments > 0) activity.push({ label: 'Comments', value: ins.comments });
              if (ins.shares > 0) activity.push({ label: 'Shares', value: ins.shares });
            }
            activity.sort((a, b) => b.value - a.value);

            const bytes = await buildReportPdf({
              listingAddress: p.listing_address || '',
              clientFirstNames: findClientNames(p.listing_address || ''),
              agentFirstName: profile?.first_name || null,
              agentFullName: profile?.full_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim(),
              agentPhone: profile?.cell_phone || null,
              agentEmail: profile?.preferred_email || profile?.email || null,
              runDates: startDate && endDate ? `${startDate} – ${endDate}` : (startDate || null),
              totalSpend: null,
              engagements: ins?.engagements || 0,
              impressions: ins?.impressions || 0,
              reach: ins?.reach || 0,
              activity,
              adImageUrl: ins?.full_picture || null,
              logoUrl: `${APP_URL}/logo.jpg`,
            });

            attachments.push({
              filename: `${slugify(p.listing_address)}-Ad-Results.pdf`,
              content: toBase64(bytes),
            });
          } catch (e) {
            console.error(`[check-ad-expiry] PDF build failed for ${p.post_id}:`, e);
            pdfFailures.push(p.post_id);
          }
        }

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
            const startRaw = p.boost_started_at || p.posted_at || p.created_at;
            const startMs = startRaw ? new Date(startRaw).getTime() : NaN;
            const fmt = (ms: number) => isNaN(ms) ? '' : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const startDate = fmt(startMs);
            const endDate = (p.duration_days > 0 && !isNaN(startMs)) ? fmt(startMs + p.duration_days * 86400000) : '';
            const ins = insightsByPost[p.id];
            const spend = ins?.ad_insights?.spend;
            const reportUrl = `${APP_URL}/ad-results/${encodeURIComponent(ins?.post_id || p.post_id)}?address=${encodeURIComponent(p.listing_address || '')}`;
            const statsRow = ins ? `
            <table cellpadding="0" cellspacing="0" style="margin-top:10px;width:100%;">
              <tr>
                <td style="padding:6px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;text-align:center;">
                  <span style="display:block;font-size:18px;font-weight:700;color:#1f2937;">${(ins.engagements || 0).toLocaleString()}</span>
                  <span style="font-size:11px;color:#6b7280;">Engagements</span>
                </td>
                <td style="width:6px;"></td>
                <td style="padding:6px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;text-align:center;">
                  <span style="display:block;font-size:18px;font-weight:700;color:#1f2937;">${(ins.impressions || 0).toLocaleString()}</span>
                  <span style="font-size:11px;color:#6b7280;">Views</span>
                </td>
                <td style="width:6px;"></td>
                <td style="padding:6px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;text-align:center;">
                  <span style="display:block;font-size:18px;font-weight:700;color:#1f2937;">${(ins.reach || 0).toLocaleString()}</span>
                  <span style="font-size:11px;color:#6b7280;">People Reached</span>
                </td>
              </tr>
            </table>` : `
            <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">Facebook numbers weren't available yet — open the report to pull them.</p>`;
            return `
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:12px;">
            <p style="margin:0;font-weight:600;color:#1f2937;font-size:14px;">${p.listing_address}</p>
            <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${[
              startDate && endDate ? `${startDate} – ${endDate}` : startDate,
              p.duration_days > 0 ? `${p.duration_days} days` : '',
            ].filter(Boolean).join(' · ')}</p>
            ${statsRow}
            ${pdfFailures.includes(p.post_id) ? `
            <p style="margin:12px 0 0;">
              <a href="${reportUrl}" style="display:inline-block;background:#9B111E;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:6px;">Open the report</a>
            </p>` : ''}
          </div>`;
          }).join('')}
          <p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;">
            ${attachments.length > 0
              ? `The full report${attachments.length > 1 ? 's are' : ' is'} attached — review ${attachments.length > 1 ? 'them' : 'it'} and forward to your seller when you're ready. Nothing is sent to clients automatically.`
              : `Open the report, review it, then send it to your seller when you're ready — nothing is sent to clients automatically.`}
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
            ...(attachments.length > 0 ? { attachments } : {}),
          }),
        });

        if (res.ok) {
          emailsSent++;
          for (const p of posts) {
            if (pendingUpdates[p.id]) {
              const { error: upErr } = await supabase.from('facebook_ad_posts').update(pendingUpdates[p.id]).eq('id', p.id);
              if (upErr) console.error(`[check-ad-expiry] Update failed for ${p.id}:`, upErr);
            }
          }
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
