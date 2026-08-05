const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function csvEscape(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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

    const baseUrl = 'https://replication.sparkapi.com/Reso/OData';
    const sparkHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'X-SparkApi-User-Agent': 'LovableListingSites/1.0',
    };

    const allMembers: any[] = [];
    const pageSize = 1000;
    const startTime = Date.now();
    const timeBudgetMs = 130_000; // stay under 150s edge timeout
    let partial = false;

    const filterClause = `$filter=${encodeURIComponent("MemberStatus eq 'Active'")}`;
    const buildUrl = (skip: number) =>
      `${baseUrl}/Member?$top=${pageSize}&$skip=${skip}&${filterClause}`;

    // Step 1: exact count of Active members
    let total = 0;
    try {
      const countResp = await fetch(`${baseUrl}/Member?$count=true&$top=1&${filterClause}`, { headers: sparkHeaders });
      if (countResp.ok) {
        const cj = await countResp.json();
        total = Number(cj['@odata.count'] || 0);
      }
    } catch (e) {
      console.warn('count request failed', e);
    }
    if (!total || Number.isNaN(total)) total = 20000; // fallback upper bound
    console.log(`Active member count: ${total}`);

    const totalPages = Math.ceil(total / pageSize);
    const concurrency = 4;

    const fetchPage = async (pageIdx: number, retry = true): Promise<any[] | null> => {
      const resp = await fetch(buildUrl(pageIdx * pageSize), { headers: sparkHeaders });
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`page ${pageIdx} error`, resp.status, text.slice(0, 200));
        if (retry) {
          await new Promise((r) => setTimeout(r, 1500));
          return fetchPage(pageIdx, false);
        }
        return null;
      }
      const json = await resp.json();
      return json.value || [];
    };

    const pageResults: (any[] | null)[] = new Array(totalPages).fill(null);
    let stopped = false;

    for (let batchStart = 0; batchStart < totalPages; batchStart += concurrency) {
      if (Date.now() - startTime > timeBudgetMs) {
        partial = true;
        stopped = true;
        console.warn(`Time budget reached at page ${batchStart} of ${totalPages}.`);
        break;
      }
      const batch: number[] = [];
      for (let i = batchStart; i < Math.min(batchStart + concurrency, totalPages); i++) batch.push(i);
      const results = await Promise.all(batch.map((i) => fetchPage(i)));
      results.forEach((r, idx) => {
        pageResults[batch[idx]] = r;
        if (r === null) partial = true;
      });
      // short-circuit if an entire batch came back empty (past the end)
      if (results.every((r) => r !== null && r.length === 0)) break;
    }

    for (const p of pageResults) {
      if (p) allMembers.push(...p);
    }

    console.log(`Fetched ${allMembers.length} members of ${total} (partial: ${partial}, stopped: ${stopped})`);


    // Build CSV
    const headers = [
      'Full Name', 'First Name', 'Last Name', 'Email',
      'Direct Phone', 'Office Phone', 'Mobile Phone',
      'Office Name', 'Office MLS ID', 'License Number', 'Member MLS ID',
      'Member Key', 'Status', 'City', 'State', 'Postal Code',
    ];
    const lines: string[] = [headers.join(',')];

    for (const m of allMembers) {
      const row = [
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
      ].map(csvEscape);
      lines.push(row.join(','));
    }

    if (partial) {
      lines.push('');
      lines.push(csvEscape(`INCOMPLETE EXPORT: time limit reached after ${allMembers.length} agents. Re-run to get a full roster.`));
    }

    const csv = lines.join('\n');
    const filename = `mls-agent-roster-${new Date().toISOString().split('T')[0]}${partial ? '-PARTIAL' : ''}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Total-Count': String(allMembers.length),
        'X-Partial': String(partial),
      },

    });
  } catch (err) {
    console.error('download-mls-roster error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
