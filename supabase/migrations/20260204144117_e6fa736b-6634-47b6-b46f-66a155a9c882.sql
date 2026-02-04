-- Add document_category column to property_documents table
ALTER TABLE public.property_documents 
ADD COLUMN IF NOT EXISTS document_category TEXT;