UPDATE public.market_analysis_files
SET analysis_json = jsonb_set(
  analysis_json,
  '{features}',
  (
    SELECT jsonb_agg(replace(f #>> '{}', 'granite countertops, ', ''))
    FROM jsonb_array_elements(analysis_json->'features') AS f
  )
)
WHERE id = '12256359-b09a-4274-b34e-795527832aa8';