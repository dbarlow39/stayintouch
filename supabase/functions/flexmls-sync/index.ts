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

    function transformListing(item: any, photos: string[] = [], fieldMaps: Record<string, Record<string, string>> = {}) {
      const sf = item.StandardFields || {};
      const rawPropType = sf.PropertyType || '';
      const resolvedPropType = fieldMaps.PropertyType?.[rawPropType] || rawPropType || 'Residential';
      const sqft = sf.BuildingAreaTotal || sf.LivingArea || 0;
      const price = sf.ListPrice || sf.CurrentPrice || 0;

      // Lot size: prefer acres, fallback to area+units
      let lotSize = 'N/A';
      if (sf.LotSizeAcres && sf.LotSizeAcres > 0) {
        lotSize = `${sf.LotSizeAcres} Acres`;
      } else if (sf.LotSizeArea && sf.LotSizeArea > 0) {
        const units = sf.LotSizeUnits || 'sqft';
        lotSize = `${sf.LotSizeArea} ${units}`;
      }

      return {
        id: item.Id || '',
        mlsNumber: sf.ListingId || sf.MLSNumber || item.Id || '',
        address: sf.UnparsedFirstLineAddress || `${sf.StreetNumber || ''} ${sf.StreetDirPrefix || ''} ${sf.StreetName || ''} ${sf.StreetSuffix || ''}`.replace(/\s+/g, ' ').trim(),
        city: sf.City || '',
        state: sf.StateOrProvince || 'OH',
        zip: sf.PostalCode || '',
        county: sf.CountyOrParish || '',
        subdivision: sf.SubdivisionName || '',
        price,
        beds: sf.BedsTotal || 0,
        baths: sf.BathroomsTotalInteger || sf.BathroomsTotalDecimal || sf.BathsFull || 0,
        bathsFull: sf.BathsFull || 0,
        bathsHalf: sf.BathsHalf || 0,
        sqft,
        lotSize,
        yearBuilt: sf.YearBuilt || 0,
        propertyType: resolvedPropType,
        propertySubType: sf.PropertySubType || '',
        status: (() => {
          const raw = (sf.MlsStatus || sf.StandardStatus || 'active').toLowerCase();
          if (raw.startsWith('contingent')) return 'contingent';
          if (raw.startsWith('pending')) return 'pending';
          if (raw === 'closed') return 'sold';
          return raw;
        })(),
        description: sf.PublicRemarks || '',
        features: [
          ...(Array.isArray(sf.ExteriorFeatures) ? sf.ExteriorFeatures : lookupToArr(sf.ExteriorFeatures)),
          ...(Array.isArray(sf.InteriorFeatures) ? sf.InteriorFeatures : lookupToArr(sf.InteriorFeatures)),
        ].filter(Boolean).slice(0, 12),
        photos,
        agent: {
          name: sf.ListAgentName || `${sf.ListAgentFirstName || ''} ${sf.ListAgentLastName || ''}`.trim(),
          phone: sf.ListAgentDirectPhone || sf.ListAgentCellPhone || sf.ListAgentOfficePhone || '',
          email: sf.ListAgentEmail || '',
          photo: '',
        },
        coordinates: { lat: sf.Latitude || 0, lng: sf.Longitude || 0 },
        published: false,
        daysOnMarket: sf.DaysOnMarket || 0,
        heating: lookupToArr(sf.Heating),
        cooling: lookupToArr(sf.Cooling),
        parking: lookupToArr(sf.ParkingFeatures),
        garageSpaces: sf.GarageSpaces || 0,
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
        taxAnnualAmount: sf.TaxAnnualAmount || 0,
        taxYear: sf.TaxYear || 0,
        hoaFee: sf.AssociationFee || 0,
        hoaFrequency: sf.AssociationFeeFrequency || '',
        waterSource: lookupToArr(sf.WaterSource),
        sewer: lookupToArr(sf.Sewer),
        schoolDistrict: sf.SchoolDistrict || '',
        elementarySchool: lookupToString(sf.ElementarySchool),
        middleSchool: lookupToString(sf.MiddleSchool),
        highSchool: lookupToString(sf.HighSchool),
        listDate: sf.ListingContractDate || sf.OnMarketDate || '',
        pricePerSqft: sqft > 0 ? Math.round(price / sqft) : 0,
        // New Zillow-matching fields
        patioAndPorch: lookupToArr(sf.PatioAndPorchFeatures),
        fencing: lookupToArr(sf.Fencing),
        foundation: lookupToArr(sf.FoundationDetails),
        parcelNumber: sf.ParcelNumber || '',
        newConstruction: sf.NewConstructionYN != null ? (sf.NewConstructionYN ? 'Yes' : 'No') : '',
        otherStructures: lookupToArr(sf.OtherStructures),
        commonWalls: lookupToString(sf.CommonWalls),
        specialConditions: lookupToArr(sf.SpecialListingConditions),
        totalStructureArea: sf.BuildingAreaTotal || 0,
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

    const allDetailFields = 'ListingId,ListPrice,BedsTotal,BathroomsTotalInteger,BathroomsTotalDecimal,BathsFull,BathsHalf,BuildingAreaTotal,LivingArea,City,StateOrProvince,PostalCode,UnparsedFirstLineAddress,StreetNumber,StreetDirPrefix,StreetName,StreetSuffix,PropertyType,PropertySubType,MlsStatus,StandardStatus,ListOfficeMlsId,ListAgentName,ListAgentFirstName,ListAgentLastName,ListAgentDirectPhone,ListAgentCellPhone,ListAgentOfficePhone,ListAgentEmail,YearBuilt,LotSizeArea,LotSizeUnits,LotSizeAcres,DaysOnMarket,PublicRemarks,Latitude,Longitude,CurrentPrice,MLSNumber,CountyOrParish,SubdivisionName,Heating,Cooling,ParkingFeatures,GarageSpaces,Flooring,Appliances,Basement,Roof,ConstructionMaterials,Stories,StoriesTotal,Levels,TaxAnnualAmount,TaxYear,AssociationFee,AssociationFeeFrequency,WaterSource,Sewer,SchoolDistrict,ElementarySchool,MiddleSchool,HighSchool,ListingContractDate,OnMarketDate,ExteriorFeatures,InteriorFeatures,PatioAndPorchFeatures,Fencing,FoundationDetails,ParcelNumber,NewConstructionYN,OtherStructures,CommonWalls,SpecialListingConditions';

    // ─── MY LISTINGS ───
    if (action === 'my_listings') {
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
      const SCAN_PARALLEL = 4;

      while (matchedIds.length < wantedCount && !scanDone && startPage <= 20) {
        const pages = Array.from({ length: SCAN_PARALLEL }, (_, i) => startPage + i).filter(p => p <= 20);
        const results = await Promise.allSettled(
          pages.map(p =>
            fetch(`${baseUrl}/listings?_limit=${perPage}&_page=${p}&_select=${scanFields}`, { method: 'GET', headers: sparkHeaders })
              .then(r => r.ok ? r.json() : null)
          )
        );

        for (const [idx, r] of results.entries()) {
          if (r.status !== 'fulfilled' || !r.value) { scanDone = true; break; }
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

      const BATCH = 10;
      const transformed: any[] = [];

      for (let i = 0; i < matchedIds.length; i += BATCH) {
        const batch = matchedIds.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map(id =>
            fetch(`${baseUrl}/listings/${id}?_select=${allDetailFields}&_expand=Photos`, { method: 'GET', headers: sparkHeaders })
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

      // Log sync timestamp to DB
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        await fetch(`${supabaseUrl}/rest/v1/sync_log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceKey,
            'Authorization': `Bearer ${serviceKey}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ sync_type: 'mls_listings', record_count: transformed.length }),
        });
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
