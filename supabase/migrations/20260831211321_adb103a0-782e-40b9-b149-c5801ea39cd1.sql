CREATE TABLE public.listing_photo_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mls_number text NOT NULL,
  address text,
  photo_index integer NOT NULL,
  storage_path text NOT NULL,
  source_url text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mls_number, photo_index)
);

GRANT SELECT ON public.listing_photo_archive TO authenticated;
GRANT ALL ON public.listing_photo_archive TO service_role;

ALTER TABLE public.listing_photo_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view archived photos"
ON public.listing_photo_archive FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_listing_photo_archive_updated_at
BEFORE UPDATE ON public.listing_photo_archive
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_listing_photo_archive_mls ON public.listing_photo_archive (mls_number);
CREATE INDEX idx_listing_photo_archive_address ON public.listing_photo_archive (address);

CREATE POLICY "Authenticated users can view listing photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'listing-photos');