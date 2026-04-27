-- Deposit return checks log
CREATE TABLE public.deposit_return_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  check_number TEXT,
  check_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payee_name TEXT NOT NULL,
  property_address TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deposit_return_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage deposit_return_checks"
ON public.deposit_return_checks
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_deposit_return_checks_updated_at
BEFORE UPDATE ON public.deposit_return_checks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Separate counter for this business account (first check is #1311)
CREATE TABLE public.deposit_return_check_counter (
  id TEXT NOT NULL DEFAULT 'default' PRIMARY KEY,
  last_check_number INTEGER NOT NULL DEFAULT 1310,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deposit_return_check_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage deposit_return_check_counter"
ON public.deposit_return_check_counter
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.deposit_return_check_counter (id, last_check_number) VALUES ('default', 1310);