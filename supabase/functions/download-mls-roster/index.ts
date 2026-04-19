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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    let nextLink: string | null = null;
    let pageCount = 0;
    const maxPages = 500; // safety cap
    const pageSize = 200;
    const startTime = Date.now();
    const timeBudgetMs = 130_000; // stay under 150s edge timeout

    const filterClause = `$filter=${encodeURIComponent("MemberStatus eq 'Active'")}`;
    const buildUrl = (skip: number) =>
      `${baseUrl}/Member?$top=${pageSize}&$skip=${skip}&${filterClause}`;

    let url: string = buildUrl(0);

    do {
      if (Date.now() - startTime > timeBudgetMs) {
        console.warn(`Time budget reached after ${pageCount} pages, ${allMembers.length} members. Returning partial roster.`);
        break;
      }

      const fetchUrl: string = nextLink || url;
      const resp = await fetch(fetchUrl, { headers: sparkHeaders });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('OData Member error:', resp.status, text);
        return new Response(
          JSON.stringify({ success: false, error: `OData Member error: ${resp.status} ${text}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const json = await resp.json();
      const results = json.value || [];
      allMembers.push(...results);
      nextLink = json['@odata.nextLink'] || null;
      pageCount++;

      // Manual pagination fallback if no nextLink but we got a full page
      if (!nextLink && results.length === pageSize && pageCount < maxPages) {
        nextLink = buildUrl(pageCount * pageSize);
      }
    } while (nextLink && pageCount < maxPages);

    console.log(`Fetched ${allMembers.length} members across ${pageCount} pages`);

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

    const csv = lines.join('\n');
    const filename = `mls-agent-roster-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Total-Count': String(allMembers.length),
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
