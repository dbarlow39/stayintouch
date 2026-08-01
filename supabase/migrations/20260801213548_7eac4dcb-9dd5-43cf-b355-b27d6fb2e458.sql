CREATE POLICY "Authenticated users can view ad images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ad-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update ad images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'ad-images' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'ad-images' AND auth.uid() IS NOT NULL);