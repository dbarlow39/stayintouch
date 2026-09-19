import { useRef, useState } from "react";
import { Camera, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

interface SellerPhotoUploadProps {
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
  uploadPhoto: (dataUrl: string) => Promise<string>;
  maxPhotos?: number;
}

const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX = 1200;
        let { width, height } = img;
        if (width > height) {
          if (width > MAX) { height *= MAX / width; width = MAX; }
        } else if (height > MAX) { width *= MAX / height; height = MAX; }
        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const SellerPhotoUpload = ({ photos, onPhotosChange, uploadPhoto, maxPhotos = 3 }: SellerPhotoUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const room = maxPhotos - photos.length;
    if (room <= 0) {
      toast.error(`You can add up to ${maxPhotos} photos here.`);
      e.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const chosen = Array.from(files).slice(0, room);
      const uploaded: string[] = [];
      for (const file of chosen) {
        const dataUrl = await compressImage(file);
        uploaded.push(await uploadPhoto(dataUrl));
      }
      onPhotosChange([...photos, ...uploaded]);
      toast.success(`${uploaded.length} photo${uploaded.length > 1 ? "s" : ""} added`);
    } catch (err: any) {
      toast.error(err?.message || "Could not add that photo. Please try again.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Photos</span>
        <span className="text-xs text-muted-foreground">({photos.length}/{maxPhotos})</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <Card key={index} className="relative aspect-square overflow-hidden">
            <img src={photo} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
            <Button
              size="icon"
              variant="destructive"
              className="absolute right-1 top-1 h-6 w-6 rounded-full"
              onClick={() => onPhotosChange(photos.filter((_, i) => i !== index))}
            >
              <X className="h-3 w-3" />
            </Button>
          </Card>
        ))}
        {photos.length < maxPhotos && (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 transition-all hover:border-[#9B111E] hover:bg-[#9B111E]/5 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Camera className="h-6 w-6 text-muted-foreground" />}
            <span className="text-xs font-medium text-muted-foreground">{busy ? "Adding…" : "Add Photo"}</span>
          </button>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
    </div>
  );
};
