CREATE TABLE public.listing_videos (
  listing_id text PRIMARY KEY,
  tour_video_url text,
  youtube_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.listing_videos TO anon;
GRANT SELECT ON public.listing_videos TO authenticated;
GRANT ALL ON public.listing_videos TO service_role;

ALTER TABLE public.listing_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Listing videos are publicly viewable"
ON public.listing_videos FOR SELECT
USING (true);

CREATE TRIGGER update_listing_videos_updated_at
BEFORE UPDATE ON public.listing_videos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();