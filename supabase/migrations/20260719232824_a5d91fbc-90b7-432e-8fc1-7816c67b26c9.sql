DELETE FROM public.marketing_plan_results
  WHERE job_id = 'ba4f2a06-bbbc-4980-910c-328b11b6a74a'
    AND (stage LIKE 'area_%' OR stage = 'area_research');

UPDATE public.marketing_plan_jobs
   SET current_batch = 0,
       expected_area_count = 7,
       gates_claimed = array_remove(array_remove(COALESCE(gates_claimed, ARRAY[]::text[]), 'stage4_dispatch'), 'stage5_dispatch'),
       status = 'running',
       current_stage = 'area_research',
       error = NULL,
       updated_at = now()
 WHERE id = 'ba4f2a06-bbbc-4980-910c-328b11b6a74a';