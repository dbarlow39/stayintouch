
ALTER TABLE public.marketing_plan_jobs ADD COLUMN IF NOT EXISTS expected_area_count int;

CREATE OR REPLACE FUNCTION public.mp_increment_area_completed(p_job_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.marketing_plan_jobs
     SET current_batch = COALESCE(current_batch, 0) + 1,
         updated_at = now()
   WHERE id = p_job_id
  RETURNING current_batch;
$$;

REVOKE ALL ON FUNCTION public.mp_increment_area_completed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mp_increment_area_completed(uuid) TO service_role;
