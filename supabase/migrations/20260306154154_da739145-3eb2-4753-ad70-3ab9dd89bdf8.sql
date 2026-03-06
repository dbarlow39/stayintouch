
CREATE OR REPLACE FUNCTION public.recover_inspection_data(target_id uuid)
RETURNS SETOF inspections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec inspections%ROWTYPE;
  page_data bytea;
  page_num integer;
BEGIN
  -- Try reading via pg_catalog approach
  FOR rec IN 
    SELECT * FROM inspections WHERE id = target_id
  LOOP
    RETURN NEXT rec;
  END LOOP;
END;
$$;
