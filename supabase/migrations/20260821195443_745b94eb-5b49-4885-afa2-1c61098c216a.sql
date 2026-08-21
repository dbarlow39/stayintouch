DELETE FROM public.market_analysis_files f
USING public.leads l
WHERE f.file_type = 'comp_remarks'
  AND f.lead_id = l.id
  AND l.address ILIKE '%5530%Brighton Hill%';