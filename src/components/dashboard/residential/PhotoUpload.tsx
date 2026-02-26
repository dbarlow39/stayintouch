import { useState, useRef } from "react";
import { Camera, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";

interface PhotoUploadProps {
  sectionId: string;
  onPhotosChange: (photos: string[]) => void;
  photos: string[];
  minPhotos?: number;
}

export const PhotoUpload = ({ sectionId, onPhotosChange, photos, minPhotos = 3 }: PhotoUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const fileArray = Array.from(files);
      const newPhotoUrls: string[] = [];
      for (const file of fileArray) {
        const compressed = await compressImage(file);
        newPhotoUrls.push(compressed);
      }
      const updatedPhotos = [...photos, ...newPhotoUrls];
      onPhotosChange(updatedPhotos);
      toast.success(`${newPhotoUrls.length} photo${newPhotoUrls.length > 1 ? 's' : ''} added successfully`);
    } catch (error) {
      console.error("Error processing photos:", error);
      toast.error("Failed to process photos. Please try again.");
    } finally {
      e.target.value = '';
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onPhotosChange(newPhotos);
    toast.success("Photo removed");
  };

  const isMinimumMet = photos.length >= minPhotos;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Photos</span>
        <span className={`text-xs font-medium ${isMinimumMet ? 'text-green-600' : 'text-muted-foreground'}`}>
          ({photos.length}/{minPhotos} suggested)
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo, index) => (
          <Card key={index} className="relative aspect-square overflow-hidden">
            <img src={photo} alt={`Photo ${index + 1}`} className="h-full w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setSelectedPhoto(photo)} />
            <Button size="icon" variant="destructive" className="absolute right-1 top-1 h-6 w-6 rounded-full" onClick={() => removePhoto(index)}>
              <X className="h-3 w-3" />
            </Button>
          </Card>
        ))}
        <button onClick={() => fileInputRef.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 transition-all hover:border-primary hover:bg-primary/5">
          <Camera className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Add Photo</span>
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" multiple onChange={handlePhotoCapture} className="hidden" />
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl w-full p-2">
          {selectedPhoto && <img src={selectedPhoto} alt="Enlarged photo" className="w-full h-auto max-h-[90vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};
