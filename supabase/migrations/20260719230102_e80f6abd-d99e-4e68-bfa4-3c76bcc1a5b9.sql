
ALTER TABLE public.marketing_plan_jobs
  ADD COLUMN IF NOT EXISTS gates_claimed text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.mp_try_claim_gate(p_job_id uuid, p_gate text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  UPDATE public.marketing_plan_jobs
     SET gates_claimed = array_append(gates_claimed, p_gate),
         updated_at = now()
   WHERE id = p_job_id
     AND NOT (p_gate = ANY(gates_claimed))
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mp_release_gate(p_job_id uuid, p_gate text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.marketing_plan_jobs
     SET gates_claimed = array_remove(gates_claimed, p_gate),
         updated_at = now()
   WHERE id = p_job_id;
$$;

REVOKE ALL ON FUNCTION public.mp_try_claim_gate(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mp_release_gate(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mp_try_claim_gate(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mp_release_gate(uuid, text) TO service_role;
