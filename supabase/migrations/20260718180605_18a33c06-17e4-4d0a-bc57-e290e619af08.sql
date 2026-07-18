
CREATE POLICY "Users read own marketing plan docs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-plan-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users insert own marketing plan docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-plan-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own marketing plan docs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-plan-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
