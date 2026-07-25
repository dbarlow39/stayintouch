
CREATE POLICY "ad-images authenticated select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'ad-images');

CREATE POLICY "ad-images authenticated update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'ad-images')
WITH CHECK (bucket_id = 'ad-images');

CREATE POLICY "ad-images authenticated insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ad-images');
