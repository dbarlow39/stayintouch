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

    const baseUrl = 'https://replication.sparkapi.com/v1';
    const sparkHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'X-SparkApi-User-Agent': 'LovableListingSites/1.0',
    };

    const allMembers: any[] = [];
    let pageToken: string | null = null;
    let pageCount = 0;
    const maxPages = 200; // safety cap (200 * 100 = 20,000 agents)

    do {
      const url = new URL(`${baseUrl}/accounts`);
      url.searchParams.set('_pagination', 'count');
      url.searchParams.set('_limit', '100');
      if (pageToken) url.searchParams.set('_pagination_token', pageToken);

      const resp = await fetch(url.toString(), { headers: sparkHeaders });
      if (!resp.ok) {
        const text = await resp.text();
        console.error('Spark API error:', resp.status, text);
        // Try alternate endpoint /contacts if /accounts not allowed
        if (pageCount === 0) {
          const altUrl = new URL(`${baseUrl}/contacts`);
          altUrl.searchParams.set('_pagination', 'count');
          altUrl.searchParams.set('_limit', '100');
          const altResp = await fetch(altUrl.toString(), { headers: sparkHeaders });
          if (!altResp.ok) {
            const altText = await altResp.text();
            return new Response(
              JSON.stringify({ success: false, error: `Spark API error: ${resp.status} ${text} | alt: ${altResp.status} ${altText}` }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          const altJson = await altResp.json();
          const altResults = altJson.D?.Results || [];
          allMembers.push(...altResults);
          pageToken = altJson.D?.Pagination?.NextPageToken || null;
          pageCount++;
          continue;
        }
        break;
      }

      const json = await resp.json();
      const results = json.D?.Results || [];
      allMembers.push(...results);
      pageToken = json.D?.Pagination?.NextPageToken || null;
      pageCount++;
    } while (pageToken && pageCount < maxPages);

    console.log(`Fetched ${allMembers.length} members across ${pageCount} pages`);

    // Build CSV
    const headers = [
      'Full Name', 'First Name', 'Last Name', 'Email', 'Phone',
      'Office Name', 'Office ID', 'License Number', 'MLS ID', 'Status',
    ];
    const lines: string[] = [headers.join(',')];

    for (const m of allMembers) {
      const row = [
        m.Name || `${m.FirstName || ''} ${m.LastName || ''}`.trim(),
        m.FirstName || '',
        m.LastName || '',
        m.Email || '',
        m.Phone || m.OfficePhone || m.MobilePhone || '',
        m.Office || m.OfficeName || '',
        m.OfficeId || m.OfficeKey || '',
        m.LicenseNumber || m.MlsLicenseNumber || '',
        m.Id || m.MemberKey || '',
        m.Status || m.MemberStatus || '',
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
