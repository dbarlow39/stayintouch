CREATE POLICY "Public can read listing videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'listing-videos');

CREATE POLICY "Authenticated can upload listing videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'listing-videos');

CREATE POLICY "Authenticated can update listing videos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'listing-videos')
WITH CHECK (bucket_id = 'listing-videos');

CREATE POLICY "Authenticated can delete listing videos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'listing-videos');