import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const MAX_BYTES = 60 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Constant-time string comparison
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const expected = Deno.env.get('VIDEO_TOKEN');
  if (!expected) {
    console.error('VIDEO_TOKEN is not configured');
    return json({ error: 'Server not configured' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ') || !safeEqual(authHeader.slice(7).trim(), expected)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Expected multipart/form-data' }, 400);
  }

  const listingId = String(form.get('listingId') ?? '').trim();
  if (!/^[A-Za-z0-9-]{6,64}$/.test(listingId)) {
    return json({ error: 'Invalid or missing listingId' }, 400);
  }

  const file = form.get('video');
  if (!(file instanceof File)) {
    return json({ error: 'Missing video file' }, 400);
  }
  const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
  if (!isMp4) {
    return json({ error: 'Video must be an MP4' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: 'Video exceeds the 60 MB limit' }, 413);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Confirm the listing exists in the MLS cache
  const { data: cache, error: cacheError } = await supabase
    .from('listings_cache')
    .select('listings')
    .eq('id', 'current')
    .maybeSingle();

  if (cacheError) {
    console.error('listings_cache read failed:', cacheError.message);
    return json({ error: 'Could not verify listing' }, 500);
  }

  const listings = Array.isArray(cache?.listings) ? (cache!.listings as any[]) : [];
  const match = listings.find((l) => String(l?.id) === listingId || String(l?.mlsNumber) === listingId);
  if (!match) {
    return json({ error: 'Listing not found' }, 404);
  }

  const path = `${listingId}.mp4`;
  const { error: uploadError } = await supabase.storage
    .from('listing-videos')
    .upload(path, await file.arrayBuffer(), { contentType: 'video/mp4', upsert: true });

  if (uploadError) {
    console.error('Video upload failed:', uploadError.message);
    return json({ error: 'Upload failed' }, 500);
  }

  // Bucket is private (workspace policy blocks public buckets), so hand back a
  // long-lived signed URL. The listing page mints its own signed URL on load.
  const { data: signed } = await supabase.storage
    .from('listing-videos')
    .createSignedUrl(path, 60 * 60 * 24 * 365);

  return json({
    success: true,
    listingId,
    path,
    url: signed?.signedUrl ?? null,
  });
});
