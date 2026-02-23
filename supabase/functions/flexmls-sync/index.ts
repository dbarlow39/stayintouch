const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const officeId = Deno.env.get('FLEXMLS_OFFICE_ID');
    const { action, params } = await req.json();

    const baseUrl = 'https://replication.sparkapi.com/v1';
    const sparkHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
      'X-SparkApi-User-Agent': 'LovableListingSites/1.0',
    };

    /** Extract keys from Spark lookup objects like {"Forced Air": true, "Gas": true} → ["Forced Air", "Gas"] */
    function lookupToArr(v: any): string[] {
      if (!v) return [];
      if (Array.isArray(v)) return v.filter(Boolean);
      if (typeof v === 'object' && v !== null) {
        return Object.keys(v).filter(k => v[k] && k !== '********');
      }
      if (typeof v === 'string' && v && v !== '********') return [v];
      return [];
    }

    /** Extract a single string from a Spark lookup object like {"Full": true} → "Full" */
    function lookupToString(v: any): string {
      if (!v) return '';
      if (typeof v === 'string') return v === '********' ? '' : v;
      if (typeof v === 'object' && v !== null) {
        const keys = Object.keys(v).filter(k => v[k] && k !== '********');
        return keys.join(', ');
      }
      return String(v);
    }

    /** Clean masked values from Spark API */
    function unmask(v: any): any {
      if (v === '********' || v === '***') return null;
      return v;
    }

    function transformListing(item: any, photos: string[] = [], fieldMaps: Record<string, Record<string, string>> = {}) {
      const sf = item.StandardFields || {};
      const rawPropType = sf.PropertyType || '';
      const resolvedPropType = unmask(sf.PropertyTypeLabel) || fieldMaps.PropertyType?.[rawPropType] || rawPropType || 'Residential';
      const sqft = unmask(sf.LivingArea) || unmask(sf.BuildingAreaTotal) || 0;
      const price = unmask(sf.ListPrice) || unmask(sf.CurrentPrice) || 0;
      const isMultiFamily = (sf.PropertyClass === 'MultiFamily' || sf.PropertySubType === 'Duplex' || rawPropType === 'C');

      // For multi-family with masked beds/baths, try to parse from description
      let beds = unmask(sf.BedsTotal) || 0;
      let baths = unmask(sf.BathroomsTotalInteger) || unmask(sf.BathroomsTotalDecimal) || unmask(sf.BathsFull) || 0;
      let bathsFull = unmask(sf.BathsFull) || 0;
      let bathsHalf = unmask(sf.BathsHalf) || 0;
      const numberOfUnits = unmask(sf.NumberOfUnitsTotal) || 0;

      if (isMultiFamily && beds === 0 && sf.PublicRemarks) {
        const remarks = sf.PublicRemarks.toLowerCase();
        // Try patterns like "2 bedrooms" or "2 bed" per unit
        const bedMatch = remarks.match(/(\d+)\s*bed(?:room)?s?/);
        const bathMatch = remarks.match(/(\d+)\s*(?:full\s+)?bath(?:room)?s?/);
        if (bedMatch) {
          const bedsPerUnit = parseInt(bedMatch[1], 10);
          beds = numberOfUnits > 1 ? bedsPerUnit * numberOfUnits : bedsPerUnit;
        }
        if (bathMatch) {
          const bathsPerUnit = parseInt(bathMatch[1], 10);
          baths = numberOfUnits > 1 ? bathsPerUnit * numberOfUnits : bathsPerUnit;
          bathsFull = baths;
        }
      }

      // Lot size: prefer acres, fallback to area+units
      let lotSize = 'N/A';
      if (sf.LotSizeAcres && sf.LotSizeAcres > 0) {
        lotSize = `${sf.LotSizeAcres} Acres`;
      } else if (sf.LotSizeArea && sf.LotSizeArea > 0) {
        const units = sf.LotSizeUnits || 'sqft';
        lotSize = `${sf.LotSizeArea} ${units}`;
      }

      // Tax: fallback from TaxAmount if TaxAnnualAmount is masked
      const taxAnnualAmount = unmask(sf.TaxAnnualAmount) || unmask(sf.TaxAmount) || 0;

      return {
        id: item.Id || '',
        mlsNumber: unmask(sf.ListingId) || unmask(sf.MLSNumber) || item.Id || '',
        address: sf.UnparsedFirstLineAddress || `${unmask(sf.StreetNumber) || ''} ${unmask(sf.StreetDirPrefix) || ''} ${unmask(sf.StreetName) || ''} ${unmask(sf.StreetSuffix) || ''}`.replace(/\s+/g, ' ').trim(),
        city: unmask(sf.City) || '',
        state: unmask(sf.StateOrProvince) || 'OH',
        zip: unmask(sf.PostalCode) || '',
        county: unmask(sf.CountyOrParish) || '',
        subdivision: unmask(sf.SubdivisionName) || '',
        price,
        beds,
        baths,
        bathsFull,
        bathsHalf,
        sqft,
        lotSize,
        yearBuilt: unmask(sf.YearBuilt) || 0,
        propertyType: resolvedPropType,
        propertySubType: sf.PropertySubType || '',
        numberOfUnits: numberOfUnits,
        status: (() => {
          const raw = (sf.MlsStatus || sf.StandardStatus || 'active').toLowerCase();
          if (raw.startsWith('contingent')) return 'contingent';
          if (raw.startsWith('pending')) return 'pending';
          if (raw === 'closed') return 'sold';
          return raw;
        })(),
        description: unmask(sf.PublicRemarks) || '',
        features: [
          ...(Array.isArray(sf.ExteriorFeatures) ? sf.ExteriorFeatures : lookupToArr(sf.ExteriorFeatures)),
          ...(Array.isArray(sf.InteriorFeatures) ? sf.InteriorFeatures : lookupToArr(sf.InteriorFeatures)),
        ].filter(Boolean).slice(0, 12),
        photos,
        agent: {
          name: unmask(sf.ListAgentName) || `${unmask(sf.ListAgentFirstName) || ''} ${unmask(sf.ListAgentLastName) || ''}`.trim(),
          mlsId: unmask(sf.ListAgentMlsId) || '',
          phone: unmask(sf.ListAgentDirectPhone) || unmask(sf.ListAgentCellPhone) || unmask(sf.ListAgentPreferredPhone) || unmask(sf.ListAgentOfficePhone) || '',
          email: unmask(sf.ListAgentEmail) || '',
          photo: '',
        },
        coordinates: { lat: sf.Latitude || 0, lng: sf.Longitude || 0 },
        published: false,
        daysOnMarket: unmask(sf.DaysOnMarket) || 0,
        heating: lookupToArr(sf.Heating),
        cooling: lookupToArr(sf.Cooling),
        parking: lookupToArr(sf.ParkingFeatures),
        garageSpaces: unmask(sf.GarageSpaces) || 0,
        flooring: lookupToArr(sf.Flooring),
        appliances: lookupToArr(sf.Appliances),
        basement: lookupToString(sf.Basement),
        roof: lookupToString(sf.Roof),
        constructionMaterials: lookupToArr(sf.ConstructionMaterials),
        stories: (() => {
          if (sf.Levels && typeof sf.Levels === 'object') {
            const keys = Object.keys(sf.Levels).filter(k => sf.Levels[k]);
            if (keys.length > 0) return keys.join(', ');
          }
          const raw = [sf.Stories, sf.StoriesTotal].find(v => v && v !== '********' && v !== 0);
          return raw || 0;
        })(),
        taxAnnualAmount,
        taxYear: unmask(sf.TaxYear) || 0,
        hoaFee: unmask(sf.AssociationFee) || 0,
        hoaFrequency: unmask(sf.AssociationFeeFrequency) || '',
        waterSource: lookupToArr(sf.WaterSource),
        sewer: lookupToArr(sf.Sewer),
        schoolDistrict: unmask(sf.SchoolDistrict) || '',
        elementarySchool: lookupToString(sf.ElementarySchool),
        middleSchool: lookupToString(sf.MiddleSchool),
        highSchool: lookupToString(sf.HighSchool),
        listDate: unmask(sf.ListingContractDate) || unmask(sf.OnMarketDate) || '',
        pricePerSqft: sqft > 0 ? Math.round(price / sqft) : 0,
        // New Zillow-matching fields
        patioAndPorch: lookupToArr(sf.PatioAndPorchFeatures),
        fencing: lookupToArr(sf.Fencing),
        foundation: lookupToArr(sf.FoundationDetails),
        parcelNumber: unmask(sf.ParcelNumber) || '',
        newConstruction: sf.NewConstructionYN != null ? (sf.NewConstructionYN ? 'Yes' : 'No') : '',
        otherStructures: lookupToArr(sf.OtherStructures),
        commonWalls: lookupToString(sf.CommonWalls),
        specialConditions: lookupToArr(sf.SpecialListingConditions),
        totalStructureArea: unmask(sf.BuildingAreaTotal) || 0,
        grossIncome: unmask(sf.GrossIncome) || 0,
        netOperatingIncome: unmask(sf.NetOperatingIncome) || 0,
      };
    }

    // ─── STANDARD FIELDS METADATA ───
    if (action === 'standardfields') {
      const labels: Record<string, string> = {
        BedsTotal: 'Total Bedrooms',
        BathroomsTotalInteger: 'Total Bathrooms',
        BathsFull: 'Full Baths',
        BuildingAreaTotal: 'Total Building Area',
        LivingArea: 'Living Area',
        ListPrice: 'Listing Price',
        City: 'City',
        StateOrProvince: 'State',
        PostalCode: 'Zip Code',
        PropertyType: 'Property Type',
        YearBuilt: 'Year Built',
        LotSizeArea: 'Lot Size',
        DaysOnMarket: 'Days on Market',
        ListingId: 'MLS Number',
        MlsStatus: 'Status',
        ListAgentName: 'Listing Agent',
        ListOfficeName: 'Listing Office',
        PublicRemarks: 'Description',
        ExteriorFeatures: 'Exterior Features',
        InteriorFeatures: 'Interior Features',
        Latitude: 'Latitude',
        Longitude: 'Longitude',
      };
      const propertyTypes: Record<string, string> = {
        A: 'Residential', B: 'Multi-Family', C: 'Commercial',
        D: 'Lots & Land', E: 'Rental', F: 'Farm & Ranch',
        G: 'Mobile/Manufactured', H: 'Condominium', I: 'Business Opportunity',
      };
      return new Response(
        JSON.stringify({ success: true, data: { labels, propertyTypes } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allDetailFields = 'ListingId,ListPrice,BedsTotal,BathroomsTotalInteger,BathroomsTotalDecimal,BathsFull,BathsHalf,BuildingAreaTotal,LivingArea,City,StateOrProvince,PostalCode,UnparsedFirstLineAddress,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,PropertyType,PropertyTypeLabel,PropertySubType,PropertyClass,MlsStatus,StandardStatus,ListOfficeMlsId,ListAgentMlsId,ListAgentName,ListAgentFirstName,ListAgentLastName,ListAgentDirectPhone,ListAgentCellPhone,ListAgentPreferredPhone,ListAgentOfficePhone,ListAgentEmail,YearBuilt,LotSizeArea,LotSizeUnits,LotSizeAcres,DaysOnMarket,PublicRemarks,Latitude,Longitude,CurrentPrice,MLSNumber,CountyOrParish,SubdivisionName,Heating,Cooling,ParkingFeatures,GarageSpaces,Flooring,Appliances,Basement,Roof,ConstructionMaterials,Stories,StoriesTotal,Levels,TaxAnnualAmount,TaxAmount,TaxYear,AssociationFee,AssociationFeeFrequency,WaterSource,Sewer,SchoolDistrict,ElementarySchool,MiddleSchool,HighSchool,ListingContractDate,OnMarketDate,ExteriorFeatures,InteriorFeatures,PatioAndPorchFeatures,Fencing,FoundationDetails,ParcelNumber,NewConstructionYN,OtherStructures,CommonWalls,SpecialListingConditions,NumberOfUnitsTotal,GrossIncome,NetOperatingIncome';

    // ─── MY LISTINGS ───
    if (action === 'my_listings') {
      const syncStart = Date.now();
      const wantedCount = params?.limit || 50;
      const statusParam = params?.status || 'active';
      const desiredStatuses: string[] = Array.isArray(statusParam)
        ? statusParam.map((s: string) => s.toLowerCase())
        : [statusParam.toLowerCase()];

      const matchedIds: string[] = [];
      const perPage = 1000;
      const scanFields = 'ListOfficeMlsId,MlsStatus';
      let startPage = 1;
      let scanDone = false;
      const SCAN_PARALLEL = 2;

      // Helper: fetch with retry on 429
      async function fetchWithRetry(url: string, opts: RequestInit, retries = 3): Promise<Response> {
        for (let attempt = 0; attempt < retries; attempt++) {
          const r = await fetch(url, opts);
          if (r.status === 429 && attempt < retries - 1) {
            const wait = (attempt + 1) * 2000; // 2s, 4s, 6s
            console.log(`Rate limited (429), retrying in ${wait}ms...`);
            await new Promise(resolve => setTimeout(resolve, wait));
            continue;
          }
          return r;
        }
        return new Response(null, { status: 429 });
      }

      while (matchedIds.length < wantedCount && !scanDone && startPage <= 20) {
        const pages = Array.from({ length: SCAN_PARALLEL }, (_, i) => startPage + i).filter(p => p <= 20);
        const results = await Promise.allSettled(
          pages.map(async p => {
            const url = `${baseUrl}/listings?_limit=${perPage}&_page=${p}&_select=${scanFields}`;
            const r = await fetchWithRetry(url, { method: 'GET', headers: sparkHeaders });
            if (!r.ok) {
              console.log(`Scan page ${p} HTTP ${r.status}`);
              return null;
            }
            return r.json();
          })
        );

        for (const [idx, r] of results.entries()) {
          if (r.status !== 'fulfilled' || !r.value) {
            console.log(`Scan page ${pages[idx]} failed or returned null, skipping`);
            continue; // Skip failed pages instead of aborting entire scan
          }
          const pageListings = r.value?.D?.Results || [];
          if (pageListings.length === 0) { scanDone = true; break; }

          for (const item of pageListings) {
            const sf = item.StandardFields || {};
            const isOffice = !officeId || String(sf.ListOfficeMlsId).trim() === String(officeId).trim();
            const status = (sf.MlsStatus || '').toLowerCase();
            const statusMatch = desiredStatuses.some(ds => status === ds || status.startsWith(ds + ' '));
            if (isOffice && statusMatch) {
              matchedIds.push(item.Id);
              if (matchedIds.length >= wantedCount) { scanDone = true; break; }
            }
          }
          console.log(`Scan page ${pages[idx]}: ${pageListings.length} listings, ${matchedIds.length} matched`);
          if (pageListings.length < perPage) { scanDone = true; break; }
          if (scanDone) break;
        }
        startPage += SCAN_PARALLEL;
      }

      console.log(`Found ${matchedIds.length} active listings for office ${officeId}`);

      const propertyTypeMap: Record<string, string> = {
        'A': 'Residential', 'B': 'Multi-Family', 'C': 'Commercial',
        'D': 'Lots & Land', 'E': 'Rental', 'F': 'Farm & Ranch',
        'G': 'Mobile/Manufactured', 'H': 'Condominium', 'I': 'Business Opportunity',
      };

      const BATCH = 20;
      const transformed: any[] = [];

      for (let i = 0; i < matchedIds.length; i += BATCH) {
        const batch = matchedIds.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(id =>
            fetchWithRetry(`${baseUrl}/listings/${id}?_select=${allDetailFields}&_expand=Photos`, { method: 'GET', headers: sparkHeaders })
              .then(r => r.ok ? r.json() : null)
          )
        );
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            const item = r.value?.D?.Results?.[0];
            if (item) {
              const photos: string[] = [];
              const sf = item.StandardFields || {};
              if (sf.Photos && Array.isArray(sf.Photos)) {
                for (const p of sf.Photos) {
                  const u = p.Uri1600 || p.Uri800 || p.Uri640 || p.UriLarge || p.Uri || '';
                  if (u) photos.push(u);
                }
              }
              transformed.push(transformListing(item, photos, { PropertyType: propertyTypeMap }));
            }
          }
        }
      }

      console.log(`Fetched details for ${transformed.length} listings`);

      // Log sync timestamp, detect changes, cache listings, and notify
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const resendKey = Deno.env.get('RESEND_API_KEY');
        const dbHeaders = {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        };

        // Fetch previous cache for change detection
        let previousListings: any[] = [];
        try {
          const cacheRes = await fetch(`${supabaseUrl}/rest/v1/listings_cache?id=eq.current&select=listings`, {
            headers: dbHeaders,
          });
          if (cacheRes.ok) {
            const cacheData = await cacheRes.json();
            if (cacheData?.[0]?.listings) previousListings = cacheData[0].listings;
          }
        } catch {}

        // Detect changes
        const prevMap = new Map(previousListings.map((l: any) => [l.mlsNumber, l]));
        const newMap = new Map(transformed.map((l: any) => [l.mlsNumber, l]));

        const changes: { newListings: any[]; removedListings: any[]; priceChanges: any[]; statusChanges: any[] } = {
          newListings: [],
          removedListings: [],
          priceChanges: [],
          statusChanges: [],
        };

        for (const [mls, listing] of newMap) {
          const prev = prevMap.get(mls);
          if (!prev) {
            changes.newListings.push(listing);
          } else {
            if (prev.price !== listing.price) {
              changes.priceChanges.push({ listing, oldPrice: prev.price, newPrice: listing.price });
            }
            if (prev.status !== listing.status) {
              changes.statusChanges.push({ listing, oldStatus: prev.status, newStatus: listing.status });
            }
          }
        }
        for (const [mls, listing] of prevMap) {
          if (!newMap.has(mls)) {
            changes.removedListings.push(listing);
          }
        }

        const hasChanges = changes.newListings.length > 0 || changes.removedListings.length > 0 ||
          changes.priceChanges.length > 0 || changes.statusChanges.length > 0;

        // Send email notification if changes detected
        if (hasChanges && resendKey && previousListings.length > 0) {
          const fmtPrice = (p: number) => '$' + p.toLocaleString('en-US');
          let html = `<h2 style="color:#1a1a1a;font-family:sans-serif;">MLS Listing Changes Detected</h2>`;
          html += `<p style="color:#666;font-family:sans-serif;font-size:14px;">Sync completed at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>`;

          if (changes.newListings.length > 0) {
            html += `<h3 style="color:#16a34a;font-family:sans-serif;">🆕 New Listings (${changes.newListings.length})</h3><ul style="font-family:sans-serif;font-size:14px;">`;
            for (const l of changes.newListings) {
              html += `<li><strong>${l.address}</strong> — ${fmtPrice(l.price)} | ${l.beds}bd/${l.baths}ba | ${l.status} | MLS# ${l.mlsNumber}</li>`;
            }
            html += `</ul>`;
          }

          if (changes.removedListings.length > 0) {
            html += `<h3 style="color:#dc2626;font-family:sans-serif;">❌ Removed Listings (${changes.removedListings.length})</h3><ul style="font-family:sans-serif;font-size:14px;">`;
            for (const l of changes.removedListings) {
              html += `<li><strong>${l.address}</strong> — ${fmtPrice(l.price)} | MLS# ${l.mlsNumber}</li>`;
            }
            html += `</ul>`;
          }

          if (changes.priceChanges.length > 0) {
            html += `<h3 style="color:#2563eb;font-family:sans-serif;">💲 Price Changes (${changes.priceChanges.length})</h3><ul style="font-family:sans-serif;font-size:14px;">`;
            for (const c of changes.priceChanges) {
              const dir = c.newPrice > c.oldPrice ? '⬆️' : '⬇️';
              html += `<li><strong>${c.listing.address}</strong> — ${fmtPrice(c.oldPrice)} → ${fmtPrice(c.newPrice)} ${dir} | MLS# ${c.listing.mlsNumber}</li>`;
            }
            html += `</ul>`;
          }

          if (changes.statusChanges.length > 0) {
            html += `<h3 style="color:#9333ea;font-family:sans-serif;">🔄 Status Changes (${changes.statusChanges.length})</h3><ul style="font-family:sans-serif;font-size:14px;">`;
            for (const c of changes.statusChanges) {
              html += `<li><strong>${c.listing.address}</strong> — ${c.oldStatus} → ${c.newStatus} | MLS# ${c.listing.mlsNumber}</li>`;
            }
            html += `</ul>`;
          }

          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
              body: JSON.stringify({
                from: 'MLS Alerts <updates@resend.sellfor1percent.com>',
                to: ['dave@sellfor1percent.com'],
                subject: `Sellfor1Percent.com MLS Changes: ${changes.newListings.length} new, ${changes.priceChanges.length} price, ${changes.statusChanges.length} status, ${changes.removedListings.length} removed qqqqq`,
                html,
              }),
            });
            console.log('Change notification email sent');
          } catch (emailErr) {
            console.log('Failed to send change email:', emailErr);
          }
        }

        console.log(`Changes detected: ${hasChanges} (new: ${changes.newListings.length}, removed: ${changes.removedListings.length}, price: ${changes.priceChanges.length}, status: ${changes.statusChanges.length})`);

        // ─── AUTO-POST TO FACEBOOK ───
        // Check if auto-posting is enabled and there are relevant changes
        if (hasChanges && previousListings.length > 0) {
          try {
            // Check global setting
            const settingsRes = await fetch(`${supabaseUrl}/rest/v1/app_settings?id=eq.default&select=auto_post_facebook`, {
              headers: dbHeaders,
            });
            const settingsData = await settingsRes.json();
            const autoPostEnabled = settingsData?.[0]?.auto_post_facebook === true;

            if (autoPostEnabled) {
              console.log('[auto-post] Auto-post Facebook is enabled, checking for connected agents...');

              // Get all agents with connected Facebook pages
              const tokensRes = await fetch(`${supabaseUrl}/rest/v1/facebook_oauth_tokens?select=agent_id,page_id,page_access_token`, {
                headers: dbHeaders,
              });
              const allTokens = await tokensRes.json();
              const connectedAgents = (allTokens || []).filter((t: any) => t.page_id && t.page_access_token);

              if (connectedAgents.length > 0) {
                console.log(`[auto-post] Found ${connectedAgents.length} connected agent(s)`);

                // Fetch profiles and roles for connected agents to determine name matching and admin status
                const agentIds = connectedAgents.map((a: any) => a.agent_id);
                
                // Fetch profiles (full_name) for matching
                const profilesRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=in.(${agentIds.join(',')})&select=id,full_name,mls_agent_id`, {
                  headers: dbHeaders,
                });
                const profilesData = await profilesRes.json();
                const mlsIdMap = new Map((profilesData || []).map((p: any) => [p.id, p.mls_agent_id || '']));

                // Fetch admin roles
                const rolesRes = await fetch(`${supabaseUrl}/rest/v1/user_roles?user_id=in.(${agentIds.join(',')})&role=eq.admin&select=user_id`, {
                  headers: dbHeaders,
                });
                const rolesData = await rolesRes.json();
                const adminSet = new Set((rolesData || []).map((r: any) => r.user_id));

                // Collect listings that need auto-posting
                const autoPostItems: { listing: any; type: 'new' | 'price_change' | 'back_on_market'; oldPrice?: number; newPrice?: number }[] = [];

                for (const listing of changes.newListings) {
                  autoPostItems.push({ listing, type: 'new' });
                }
                for (const pc of changes.priceChanges) {
                  autoPostItems.push({ listing: pc.listing, type: 'price_change', oldPrice: pc.oldPrice, newPrice: pc.newPrice });
                }
                for (const sc of changes.statusChanges) {
                  if (sc.newStatus === 'active' && sc.oldStatus !== 'active') {
                    autoPostItems.push({ listing: sc.listing, type: 'back_on_market' });
                  }
                }

                if (autoPostItems.length > 0) {
                  console.log(`[auto-post] ${autoPostItems.length} listings to auto-post`);

                  const fmtPrice = (p: number) => '$' + p.toLocaleString('en-US');

                  for (const item of autoPostItems) {
                    const l = item.listing;
                    const fullAddress = `${l.address}, ${l.city}, ${l.state} ${l.zip}`;
                    const listingAgentMlsId = (l.agent?.mlsId || '').trim();

                    // Generate message based on type
                    let message = '';
                    if (item.type === 'new') {
                      message = `🏠 NEW LISTING!\n\n📍 ${fullAddress}\n💰 ${fmtPrice(l.price)}\n🛏️ ${l.beds} Beds | 🛁 ${l.baths} Baths | 📐 ${(l.sqft || 0).toLocaleString()} sqft\n\n${(l.description || '').slice(0, 200)}\n\n📞 Contact ${l.agent?.name || 'us'} for details!\n\n#RealEstate #${(l.city || '').replace(/\s/g, '')} #NewListing #HomeForSale #Ohio`;
                    } else if (item.type === 'price_change') {
                      const dir = (item.newPrice || 0) < (item.oldPrice || 0) ? 'REDUCED' : 'UPDATED';
                      message = `💲 PRICE ${dir}!\n\n📍 ${fullAddress}\n💰 ${fmtPrice(item.oldPrice || 0)} → ${fmtPrice(item.newPrice || 0)}\n🛏️ ${l.beds} Beds | 🛁 ${l.baths} Baths | 📐 ${(l.sqft || 0).toLocaleString()} sqft\n\n${(l.description || '').slice(0, 200)}\n\n📞 Contact ${l.agent?.name || 'us'} for details!\n\n#RealEstate #${(l.city || '').replace(/\s/g, '')} #PriceReduced #HomeForSale #Ohio`;
                    } else if (item.type === 'back_on_market') {
                      message = `🔄 BACK ON MARKET!\n\n📍 ${fullAddress}\n💰 ${fmtPrice(l.price)}\n🛏️ ${l.beds} Beds | 🛁 ${l.baths} Baths | 📐 ${(l.sqft || 0).toLocaleString()} sqft\n\n${(l.description || '').slice(0, 200)}\n\n📞 Contact ${l.agent?.name || 'us'} for details!\n\n#RealEstate #${(l.city || '').replace(/\s/g, '')} #BackOnMarket #HomeForSale #Ohio`;
                    }

                    // Post to relevant agents' pages:
                    // - Admins get ALL listings posted to their page
                    // - Non-admin agents only get listings matching their MLS Agent ID
                    for (const agent of connectedAgents) {
                      const isAdmin = adminSet.has(agent.agent_id);
                      if (!isAdmin) {
                        const agentMlsId = (mlsIdMap.get(agent.agent_id) || '').trim();
                        if (!agentMlsId || !listingAgentMlsId || agentMlsId !== listingAgentMlsId) {
                          continue; // Skip — not their listing
                        }
                      }

                      try {
                        // Use OG link share (like manual ads) so Facebook renders a rich preview card
                        // with listing details, branded image, and the FORMOREINFO domain
                        const ogBaseUrl = 'https://formoreinfo.sellfor1percent.com/og-listing';
                        const listingId = l.id || l.mlsNumber;
                        let ogLink = `${ogBaseUrl}?id=${encodeURIComponent(listingId)}`;

                        // If there's a photo, include it as the og:image source
                        if (l.photos && l.photos.length > 0) {
                          ogLink += `&image=${encodeURIComponent(l.photos[0])}`;
                        }

                        // Add cache-busting timestamp
                        ogLink += `&v=${Math.floor(Date.now() / 1000)}`;

                        const postBody: any = {
                          message,
                          link: ogLink,
                          access_token: agent.page_access_token,
                        };

                        const postUrl = `https://graph.facebook.com/v21.0/${agent.page_id}/feed`;

                        const postResp = await fetch(postUrl, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(postBody),
                        });
                        const postResult = await postResp.json();

                        if (postResult.error) {
                          console.error(`[auto-post] Failed for agent ${agent.agent_id}:`, postResult.error.message);
                          continue;
                        }

                        const finalPostId = postResult.post_id || postResult.id;
                        console.log(`[auto-post] Posted ${item.type} for ${l.address} to ${isAdmin ? 'admin' : 'agent'} ${agent.agent_id}: ${finalPostId}`);

                        // Log to facebook_ad_posts
                        await fetch(`${supabaseUrl}/rest/v1/facebook_ad_posts`, {
                          method: 'POST',
                          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
                          body: JSON.stringify({
                            agent_id: agent.agent_id,
                            listing_id: l.id || l.mlsNumber,
                            listing_address: fullAddress,
                            post_id: finalPostId,
                            daily_budget: 0,
                            duration_days: 0,
                            status: 'organic',
                          }),
                        });
                      } catch (agentErr) {
                        console.error(`[auto-post] Error posting for agent ${agent.agent_id}:`, agentErr);
                      }
                    }
                  }
                }
              } else {
                console.log('[auto-post] No agents with connected Facebook pages');
              }
            }
          } catch (autoPostErr) {
            console.error('[auto-post] Auto-post error:', autoPostErr);
          }
        }

        // Log sync
        await fetch(`${supabaseUrl}/rest/v1/sync_log`, {
          method: 'POST',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ sync_type: 'mls_listings', record_count: transformed.length }),
        });

        // Safety guard: don't overwrite cache if new count is drastically lower than previous
        const prevCount = previousListings.length;
        const newCount = transformed.length;
        const shouldUpdateCache = prevCount === 0 || newCount >= Math.floor(prevCount * 0.5);

        if (shouldUpdateCache) {
          // Update listings cache
          await fetch(`${supabaseUrl}/rest/v1/listings_cache?id=eq.current`, {
            method: 'DELETE',
            headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          });
          await fetch(`${supabaseUrl}/rest/v1/listings_cache`, {
            method: 'POST',
            headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ id: 'current', listings: transformed, updated_at: new Date().toISOString() }),
          });
          console.log('Listings cache updated with', newCount, 'listings');
        } else {
          console.log(`SKIPPED cache update: new count (${newCount}) is too low vs previous (${prevCount}). Possible API issue.`);
        }
      } catch (e) {
        console.log('Failed to log sync:', e);
      }

      return new Response(
        JSON.stringify({ success: true, data: transformed, total: transformed.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── SINGLE LISTING ───
    if (action === 'single_listing') {
      const singleUrl = `${baseUrl}/listings/${params.listingId}?_select=${allDetailFields}&_expand=Photos`;
      console.log('Fetching single:', singleUrl);
      const singleRes = await fetch(singleUrl, { method: 'GET', headers: sparkHeaders });
      const singleData = await singleRes.json();
      
      if (!singleRes.ok) {
        return new Response(
          JSON.stringify({ success: false, error: singleData?.D?.Message || `API returned ${singleRes.status}` }),
          { status: singleRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const item = singleData?.D?.Results?.[0];
      if (!item) {
        return new Response(
          JSON.stringify({ success: false, error: 'Listing not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const sf = item.StandardFields || {};
      const photos: string[] = [];
      if (sf.Photos && Array.isArray(sf.Photos)) {
        for (const p of sf.Photos) {
          const u = p.Uri1600 || p.Uri800 || p.Uri640 || p.UriLarge || p.Uri || '';
          if (u) photos.push(u);
        }
      }
      const propertyTypeMap: Record<string, string> = {
        'A': 'Residential', 'B': 'Multi-Family', 'C': 'Commercial',
        'D': 'Lots & Land', 'E': 'Rental', 'F': 'Farm & Ranch',
        'G': 'Mobile/Manufactured', 'H': 'Condominium', 'I': 'Business Opportunity',
      };
      const transformed = transformListing(item, photos, { PropertyType: propertyTypeMap });

      // If MLS didn't provide tax amount, try Estated API as fallback
      if (!transformed.taxAnnualAmount) {
        const estatedKey = Deno.env.get('ESTATED_API_KEY');
        if (estatedKey && transformed.address && transformed.state) {
          try {
            const addr = encodeURIComponent(transformed.address);
            const city = encodeURIComponent(transformed.city || '');
            const state = encodeURIComponent(transformed.state || '');
            const zip = encodeURIComponent(transformed.zip || '');
            const estatedUrl = `https://apis.estated.com/v4/property?token=${estatedKey}&combined_address=${addr}, ${city}, ${state} ${zip}`;
            const estRes = await fetch(estatedUrl);
            if (estRes.ok) {
              const estData = await estRes.json();
              const taxAmount = estData?.data?.taxes?.[0]?.amount;
              if (taxAmount && taxAmount > 0) {
                transformed.taxAnnualAmount = taxAmount;
                console.log(`Estated fallback: found tax $${taxAmount} for ${transformed.address}`);
              }
            }
          } catch (e) {
            console.log('Estated tax fallback failed:', e);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, data: transformed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ─── RAW LISTING (debug) ───
    if (action === 'raw_listing') {
      const expand = params.expand || 'Photos';
      const rawUrl = `${baseUrl}/listings/${params.listingId}?_expand=${expand}`;
      const rawRes = await fetch(rawUrl, { method: 'GET', headers: sparkHeaders });
      const rawData = await rawRes.json();
      const result = rawData?.D?.Results?.[0];
      return new Response(
        JSON.stringify({ success: true, data: result }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Edge function error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
