-- Create storage bucket for deal documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-documents', 'deal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for deal-documents bucket
-- Allow authenticated users to upload files to their own folder
CREATE POLICY "Users can upload deal documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'deal-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own documents
CREATE POLICY "Users can view own deal documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'deal-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete own deal documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'deal-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create table to track documents associated with properties
CREATE TABLE IF NOT EXISTS public.property_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL,
  property_id UUID REFERENCES public.estimated_net_properties(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on property_documents
ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for property_documents
CREATE POLICY "Users can view own property documents"
ON public.property_documents
FOR SELECT
TO authenticated
USING (agent_id = auth.uid());

CREATE POLICY "Users can insert own property documents"
ON public.property_documents
FOR INSERT
TO authenticated
WITH CHECK (agent_id = auth.uid());

CREATE POLICY "Users can delete own property documents"
ON public.property_documents
FOR DELETE
TO authenticated
USING (agent_id = auth.uid());