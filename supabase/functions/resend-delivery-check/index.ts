import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY missing');

    const res = await fetch('https://api.resend.com/emails?limit=30', {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    // Fetch detail for each email to get last_event/status
    const list = data?.data || [];
    const detailed = await Promise.all(
      list.slice(0, 30).map(async (e: any) => {
        try {
          const r = await fetch(`https://api.resend.com/emails/${e.id}`, {
            headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
          });
          const d = await r.json();
          return {
            id: e.id,
            to: d.to,
            subject: d.subject,
            created_at: d.created_at,
            last_event: d.last_event,
          };
        } catch {
          return { id: e.id, error: 'detail fetch failed' };
        }
      })
    );

    return new Response(JSON.stringify({ status: res.status, count: detailed.length, emails: detailed }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
