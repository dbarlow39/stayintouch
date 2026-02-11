
-- Create a public storage bucket for generated ad images
INSERT INTO storage.buckets (id, name, public) VALUES ('ad-images', 'ad-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view ad images (needed for Facebook to fetch the image)
CREATE POLICY "Ad images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'ad-images');

-- Allow authenticated users to upload ad images
CREATE POLICY "Authenticated users can upload ad images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ad-images' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to delete their ad images
CREATE POLICY "Authenticated users can delete ad images"
ON storage.objects FOR DELETE
USING (bucket_id = 'ad-images' AND auth.uid() IS NOT NULL);
