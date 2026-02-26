
-- Create inspections table for residential work sheets
CREATE TABLE public.inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  property_address TEXT NOT NULL DEFAULT 'Untitled Property',
  inspection_data JSONB DEFAULT '{}',
  photos JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inspections"
  ON public.inspections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own inspections"
  ON public.inspections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inspections"
  ON public.inspections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inspections"
  ON public.inspections FOR DELETE
  USING (auth.uid() = user_id);

-- Create audio_transcriptions table
CREATE TABLE public.audio_transcriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  audio_file_path TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  transcription TEXT,
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audio_transcriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transcriptions"
  ON public.audio_transcriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transcriptions"
  ON public.audio_transcriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transcriptions"
  ON public.audio_transcriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transcriptions"
  ON public.audio_transcriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at on inspections
CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create trigger for updated_at on audio_transcriptions
CREATE TRIGGER update_audio_transcriptions_updated_at
  BEFORE UPDATE ON public.audio_transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('inspection-photos', 'inspection-photos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-recordings', 'audio-recordings', false);

-- Storage policies for inspection photos
CREATE POLICY "Anyone can view inspection photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inspection-photos');

CREATE POLICY "Users can upload inspection photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their inspection photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their inspection photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'inspection-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for audio recordings
CREATE POLICY "Users can view their own audio recordings"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'audio-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload audio recordings"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their audio recordings"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'audio-recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
