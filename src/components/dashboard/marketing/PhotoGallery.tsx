import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Camera } from 'lucide-react';

interface PhotoGalleryProps {
  photos: string[];
  address: string;
}

const PhotoGallery = ({ photos, address }: PhotoGalleryProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const displayPhotos = photos.length > 0 ? photos : [];
  const hasPhotos = displayPhotos.length > 0;

  const prev = () => setCurrentIndex((i) => (i === 0 ? displayPhotos.length - 1 : i - 1));
  const next = () => setCurrentIndex((i) => (i === displayPhotos.length - 1 ? 0 : i + 1));

  if (!hasPhotos) {
    return (
      <div className="relative h-[50vh] bg-muted flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-lg">No photos available</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="relative h-[50vh] md:h-[60vh] cursor-pointer group"
        onClick={() => { setCurrentIndex(0); setIsOpen(true); }}
      >
        {displayPhotos.length >= 5 ? (
          <div className="grid grid-cols-4 grid-rows-2 gap-1 h-full">
            <div className="col-span-2 row-span-2 relative overflow-hidden">
              <img src={displayPhotos[0]} alt={address} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            {displayPhotos.slice(1, 5).map((photo, i) => (
              <div key={i} className="relative overflow-hidden">
                <img src={photo} alt={`${address} ${i + 2}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </div>
            ))}
          </div>
        ) : displayPhotos.length >= 3 ? (
          <div className="grid grid-cols-3 gap-1 h-full">
            <div className="col-span-2 relative overflow-hidden">
              <img src={displayPhotos[0]} alt={address} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
            <div className="grid grid-rows-2 gap-1">
              {displayPhotos.slice(1, 3).map((photo, i) => (
                <div key={i} className="relative overflow-hidden">
                  <img src={photo} alt={`${address} ${i + 2}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <img src={displayPhotos[0]} alt={address} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        )}

        <div className="absolute bottom-4 right-4 z-10">
          <Button
            variant="secondary"
            size="sm"
            className="bg-card/90 backdrop-blur-sm text-card-foreground"
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(0); setIsOpen(true); }}
          >
            <Camera className="w-4 h-4 mr-1.5" />
            {displayPhotos.length} Photos
          </Button>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black border-none [&>button]:hidden">
          <div className="relative w-full h-[90vh] flex items-center justify-center">
            <img
              src={displayPhotos[currentIndex]}
              alt={`${address} ${currentIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="w-6 h-6" />
            </Button>
            {displayPhotos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                  onClick={(e) => { e.stopPropagation(); prev(); }}
                >
                  <ChevronLeft className="w-8 h-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                  onClick={(e) => { e.stopPropagation(); next(); }}
                >
                  <ChevronRight className="w-8 h-8" />
                </Button>
              </>
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-3 py-1 rounded-full">
              {currentIndex + 1} / {displayPhotos.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PhotoGallery;
