import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ListingVideoPlayerProps {
  listingId: string;
  address?: string;
}

/**
 * Renders the branded tour video for a listing, if one has been uploaded.
 * Convention: listing-videos/<listingId>.mp4 — renders nothing when absent.
 */
const ListingVideoPlayer = ({ listingId, address }: ListingVideoPlayerProps) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!listingId) return;
    (async () => {
      try {
        const { data } = await supabase.storage
          .from('listing-videos')
          .createSignedUrl(`${listingId}.mp4`, 60 * 60);
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      } catch {
        if (!cancelled) setUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (!url) return null;

  return (
    <section className="container mx-auto px-6 pt-8">
      <h2 className="text-xl font-semibold text-foreground mb-3">Video Tour</h2>
      <div className="relative w-full overflow-hidden rounded-xl border border-border bg-black aspect-video">
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full"
          aria-label={address ? `Video tour of ${address}` : 'Property video tour'}
        />
      </div>
    </section>
  );
};

export default ListingVideoPlayer;
