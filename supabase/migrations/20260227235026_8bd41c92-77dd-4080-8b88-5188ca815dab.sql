ALTER TABLE public.leads ADD COLUMN city text NULL;
ALTER TABLE public.leads ADD COLUMN state text NULL DEFAULT 'OH';
ALTER TABLE public.leads ADD COLUMN zip text NULL;