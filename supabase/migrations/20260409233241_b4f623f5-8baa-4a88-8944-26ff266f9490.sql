
CREATE TABLE public.check_number_counter (
  id text NOT NULL DEFAULT 'default' PRIMARY KEY,
  last_check_number integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.check_number_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage check_number_counter"
ON public.check_number_counter
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.check_number_counter (id, last_check_number) VALUES ('default', 0);
