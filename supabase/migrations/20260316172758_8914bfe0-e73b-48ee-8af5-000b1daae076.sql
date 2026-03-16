INSERT INTO storage.buckets (id, name, public)
VALUES ('market-analysis-docs', 'market-analysis-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload market analysis docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'market-analysis-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own market analysis docs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'market-analysis-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own market analysis docs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'market-analysis-docs' AND (storage.foldername(name))[1] = auth.uid()::text);