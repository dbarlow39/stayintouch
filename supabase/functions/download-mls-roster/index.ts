const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { requireUser } from "../_shared/verifyAuth.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const _auth = await requireUser(req);
  if (_auth instanceof Response) return _auth;

  try {
    const apiKey = Deno.env.get('FLEXMLS_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Flexmls API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    const startSkip = Number(body?.skip) || 0;

    const baseUrl = 'https://replication.sparkapi.com/Reso/OData';
    const sparkHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'X-SparkApi-User-Agent': 'LovableListingSites/1.0',
    };

    const pageSize = 1000;
    const startTime = Date.now();
    const timeBudgetMs = 90_000; // leave headroom under the edge timeout

    const filterClause = `$filter=${encodeURIComponent("MemberStatus eq 'Active'")}`;
    const buildUrl = (skip: number) =>
      `${baseUrl}/Member?$top=${pageSize}&$skip=${skip}&${filterClause}`;

    // Exact count of Active members (only needed on the first chunk)
    let total = Number(body?.total) || 0;
    if (!total) {
      try {
        const countResp = await fetch(`${baseUrl}/Member?$count=true&$top=1&${filterClause}`, { headers: sparkHeaders });
        if (countResp.ok) {
          const cj = await countResp.json();
          total = Number(cj['@odata.count'] || 0);
        }
      } catch (e) {
        console.warn('count request failed', e);
      }
    }

    const fetchPage = async (skip: number, retry = true): Promise<any[] | null> => {
      const resp = await fetch(buildUrl(skip), { headers: sparkHeaders });
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`skip ${skip} error`, resp.status, text.slice(0, 200));
        if (retry) {
          await new Promise((r) => setTimeout(r, 1500));
          return fetchPage(skip, false);
        }
        return null;
      }
      const json = await resp.json();
      return json.value || [];
    };

    const members: any[] = [];
    let skip = startSkip;
    let done = false;

    while (Date.now() - startTime < timeBudgetMs) {
      const page = await fetchPage(skip);
      if (page === null) break; // transient error: client can resume from current skip
      members.push(...page);
      skip += pageSize;
      if (page.length < pageSize || (total && skip >= total)) {
        done = true;
        break;
      }
    }

    const rows = members.map((m) => [
      m.MemberFullName || `${m.MemberFirstName || ''} ${m.MemberLastName || ''}`.trim(),
      m.MemberFirstName || '',
      m.MemberLastName || '',
      m.MemberEmail || '',
      m.MemberDirectPhone || '',
      m.MemberOfficePhone || '',
      m.MemberMobilePhone || '',
      m.OfficeName || '',
      m.OfficeMlsId || '',
      m.MemberStateLicense || m.MemberNationalAssociationId || '',
      m.MemberMlsId || '',
      m.MemberKey || '',
      m.MemberStatus || '',
      m.MemberCity || '',
      m.MemberStateOrProvince || '',
      m.MemberPostalCode || '',
    ]);

    console.log(`chunk from ${startSkip}: ${rows.length} rows, nextSkip=${done ? null : skip}, total=${total}`);

    return new Response(
      JSON.stringify({
        success: true,
        rows,
        count: rows.length,
        total,
        nextSkip: done ? null : skip,
        done,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('download-mls-roster error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
