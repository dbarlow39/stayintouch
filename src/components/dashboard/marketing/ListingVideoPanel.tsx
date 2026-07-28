import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Video, Upload, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { MarketingListing } from '@/data/marketingListings';

const MAX_BYTES = 60 * 1024 * 1024;

interface ListingVideoPanelProps {
  listing: MarketingListing;
}

const ListingVideoPanel = ({ listing }: ListingVideoPanelProps) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const objectPath = `${listing.id}.mp4`;

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.storage
        .from('listing-videos')
        .createSignedUrl(objectPath, 60 * 60);
      setPreviewUrl(data?.signedUrl ?? null);
    } catch {
      setPreviewUrl(null);
    }
  }, [objectPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFile = async (file: File) => {
    if (file.type !== 'video/mp4' && !file.name.toLowerCase().endsWith('.mp4')) {
      toast.error('Please choose an MP4 file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Video must be 60 MB or smaller.');
      return;
    }

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from('listing-videos')
        .upload(objectPath, file, { upsert: true, contentType: 'video/mp4' });
      if (error) throw error;
      toast.success('Video uploaded — it is now live on the listing page.');
      await refresh();
    } catch (err: any) {
      console.error('Video upload failed:', err);
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const { error } = await supabase.storage.from('listing-videos').remove([objectPath]);
      if (error) throw error;
      setPreviewUrl(null);
      toast.success('Video removed');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove video');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Video className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Branded Video</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Upload an MP4 (60 MB max). It is saved as <span className="font-mono text-xs">{objectPath}</span> and
        appears automatically on the public listing page. Uploading again replaces it.
      </p>

      {previewUrl && (
        <video src={previewUrl} controls className="w-full rounded-lg border border-border bg-black aspect-video" />
      )}

      <div className="flex items-center gap-2">
        <label>
          <input
            type="file"
            accept="video/mp4"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) handleFile(file);
            }}
          />
          <Button asChild disabled={uploading}>
            <span className="cursor-pointer">
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {uploading ? 'Uploading...' : previewUrl ? 'Replace Video' : 'Upload Video'}
            </span>
          </Button>
        </label>
        {previewUrl && (
          <Button variant="outline" onClick={handleRemove} disabled={uploading}>
            <Trash2 className="w-4 h-4 mr-2" /> Remove
          </Button>
        )}
      </div>
    </div>
  );
};

export default ListingVideoPanel;
