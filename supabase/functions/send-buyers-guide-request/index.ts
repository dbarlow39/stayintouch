import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PDF_URL = 'https://ujhohggsvijjqoatvwnl.supabase.co/storage/v1/object/public/buyers-guide/things-to-consider-when-buying-a-home-spring-2026.pdf';
const COVER_URL = 'https://ujhohggsvijjqoatvwnl.supabase.co/storage/v1/object/public/buyers-guide/cover-2026.jpg';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const buyingTimeframe = String(body.buyingTimeframe || '').trim();
    const mlsId = String(body.mlsId || '').trim();
    const propertyStreet = String(body.propertyStreet || '').trim();

    if (!name || !email || !phone) {
      return new Response(JSON.stringify({ error: 'Name, email, and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    // Insert into DB
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: insertErr } = await supabase.from('buyers_guide_requests').insert({
      name,
      email,
      phone,
      buying_timeframe: buyingTimeframe || null,
      mls_id: mlsId || null,
      property_street: propertyStreet || null,
      inquirer_ip: ip,
    });
    if (insertErr) console.error('[buyers-guide] insert error', insertErr);

    // Send email via Resend
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const propertyLine = propertyStreet
      ? `<p style="margin:0 0 12px 0;color:#666;font-size:14px;">You requested this guide while viewing <strong>${propertyStreet}</strong>.</p>`
      : '';

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#222;">
        <h1 style="color:#8B0000;font-size:24px;margin:0 0 16px 0;">Your Buyers Guide Is Here, ${name.split(' ')[0]}!</h1>
        <p style="font-size:16px;line-height:1.5;margin:0 0 16px 0;">
          Thanks for requesting our <strong>Things to Consider When Buying a Home</strong> guide
          (Spring 2026 Edition, 15 pages). Click the button below to download your copy.
        </p>
        ${propertyLine}
        <p style="text-align:center;margin:28px 0;">
          <a href="${PDF_URL}"
             style="background:#8B0000;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;font-size:16px;display:inline-block;">
            Download Your Buyers Guide (PDF)
          </a>
        </p>
        <p style="font-size:14px;line-height:1.5;color:#555;margin:24px 0 0 0;">
          Inside you'll find clear, practical info on financing, the home search,
          making an offer, inspections, and closing — everything we walk our buyers through.
        </p>
        <p style="font-size:14px;line-height:1.5;color:#555;margin:16px 0 0 0;">
          When you're ready to start looking — or if you just have a question — reply to this
          email or give us a call. We're here to help.
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:28px 0;" />
        <p style="font-size:13px;color:#888;margin:0;">
          Thanks,<br/>
          <strong>Jaime Barlow</strong><br/>
          614-493-8541<br/>
          Sell For 1 Percent · Columbus, OH<br/>
          <a href="https://sellfor1percent.com" style="color:#8B0000;">sellfor1percent.com</a>
        </p>
      </div>
    `;

    const subject = 'Your Buyers Guide — Things to Consider When Buying a Home (Spring 2026)';

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Dave & Jaime Barlow <jaime@resend.sellfor1percent.com>',
        to: [email],
        cc: ['dave@sellfor1percent.com', 'jaime@sellfor1percent.com'],
        reply_to: 'jaime@sellfor1percent.com',
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('[buyers-guide] resend error', errText);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[buyers-guide] error', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
