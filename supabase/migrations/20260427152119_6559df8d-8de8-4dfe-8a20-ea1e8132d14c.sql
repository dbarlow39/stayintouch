-- 1) Create private bucket for closing paperwork
INSERT INTO storage.buckets (id, name, public)
VALUES ('closing-paperwork', 'closing-paperwork', false)
ON CONFLICT (id) DO NOTHING;

-- 2) RLS policies on storage.objects for this bucket (admins only)
CREATE POLICY "Admins can view closing paperwork"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'closing-paperwork'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can upload closing paperwork"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'closing-paperwork'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can update closing paperwork"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'closing-paperwork'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Admins can delete closing paperwork"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'closing-paperwork'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- 3) Add paperwork_files column to closings
ALTER TABLE public.closings
ADD COLUMN IF NOT EXISTS paperwork_files jsonb NOT NULL DEFAULT '[]'::jsonb;