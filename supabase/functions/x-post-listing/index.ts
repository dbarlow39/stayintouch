import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const CONSUMER_KEY = Deno.env.get('TWITTER_CONSUMER_KEY');
const CONSUMER_SECRET = Deno.env.get('TWITTER_CONSUMER_SECRET');
const ACCESS_TOKEN = Deno.env.get('TWITTER_ACCESS_TOKEN');
const ACCESS_TOKEN_SECRET = Deno.env.get('TWITTER_ACCESS_TOKEN_SECRET');

function pct(s: string) {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

async function hmacSha1(key: string, msg: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function oauthHeader(method: string, url: string): Promise<string> {
  const params: Record<string, string> = {
    oauth_consumer_key: CONSUMER_KEY!,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN!,
    oauth_version: '1.0',
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join('&');
  const base = `${method.toUpperCase()}&${pct(url)}&${pct(paramString)}`;
  const signingKey = `${pct(CONSUMER_SECRET!)}&${pct(ACCESS_TOKEN_SECRET!)}`;
  const signature = await hmacSha1(signingKey, base);
  const all = { ...params, oauth_signature: signature };
  return 'OAuth ' + Object.keys(all)
    .sort()
    .map((k) => `${pct(k)}="${pct((all as Record<string, string>)[k])}"`)
    .join(', ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    if (!CONSUMER_KEY || !CONSUMER_SECRET || !ACCESS_TOKEN || !ACCESS_TOKEN_SECRET) {
      return json({ error: 'X API credentials are not configured' }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';
    if (!text) return json({ error: 'text is required' }, 400);

    let mediaId: string | null = null;

    if (imageUrl) {
      const imgResp = await fetch(imageUrl);
      if (!imgResp.ok) {
        return json({ error: `Could not download ad image (${imgResp.status})` }, 400);
      }
      const imgBlob = await imgResp.blob();

      const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
      const form = new FormData();
      form.append('media', imgBlob, 'ad.png');

      const uploadResp = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: await oauthHeader('POST', uploadUrl) },
        body: form,
      });
      const uploadText = await uploadResp.text();
      if (!uploadResp.ok) {
        console.error(`[x-post] media upload failed [${uploadResp.status}]: ${uploadText}`);
        return json({ error: 'X media upload failed', status: uploadResp.status, details: uploadText }, uploadResp.status);
      }
      mediaId = JSON.parse(uploadText).media_id_string;
    }

    const tweetUrl = 'https://api.x.com/2/tweets';
    const payload: Record<string, unknown> = { text };
    if (mediaId) payload.media = { media_ids: [mediaId] };

    const tweetResp = await fetch(tweetUrl, {
      method: 'POST',
      headers: {
        Authorization: await oauthHeader('POST', tweetUrl),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const tweetText = await tweetResp.text();
    if (!tweetResp.ok) {
      console.error(`[x-post] tweet failed [${tweetResp.status}]: ${tweetText}`);
      return json({ error: 'X post failed', status: tweetResp.status, details: tweetText }, tweetResp.status);
    }

    const data = JSON.parse(tweetText);
    console.log('[x-post] posted:', data?.data?.id);
    return json({ tweet_id: data?.data?.id ?? null });
  } catch (err) {
    console.error('[x-post] error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});
