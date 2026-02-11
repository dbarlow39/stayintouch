import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Image, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { MarketingListing, formatListingPrice } from '@/data/marketingListings';
import logo from '@/assets/logo.jpg';

const bannerOptions = [
  { value: 'auto', label: 'Auto-detect from Status' },
  { value: 'new-listing', label: 'NEW LISTING' },
  { value: 'just-sold', label: 'JUST SOLD' },
  { value: 'price-change', label: 'PRICE CHANGE' },
  { value: 'open-house', label: 'OPEN HOUSE' },
  { value: 'under-contract', label: 'UNDER CONTRACT' },
  { value: 'back-on-market', label: 'BACK ON MARKET' },
];

function getBannerText(listing: MarketingListing, override: string): string {
  if (override !== 'auto') {
    return bannerOptions.find(o => o.value === override)?.label || override.toUpperCase();
  }
  switch (listing.status) {
    case 'sold': return 'JUST SOLD';
    case 'pending': return 'UNDER CONTRACT';
    case 'contingent': return 'UNDER CONTRACT';
    case 'active':
    default:
      return listing.daysOnMarket <= 7 ? 'NEW LISTING' : 'FOR SALE';
  }
}

interface AdGeneratorPanelProps {
  listing: MarketingListing;
}

const AdGeneratorPanel = ({ listing }: AdGeneratorPanelProps) => {
  const [bannerType, setBannerType] = useState('auto');
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const adRef = useRef<HTMLDivElement>(null);

  const bannerText = getBannerText(listing, bannerType);
  const heroPhoto = listing.photos?.[0];
  const fullAddress = `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`;

  const generateAd = async () => {
    if (!adRef.current) return;
    setGenerating(true);
    try {
      const canvas = await html2canvas(adRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 540,
        height: 540,
      });
      const url = canvas.toDataURL('image/png');
      setPreviewUrl(url);
      toast.success('Ad generated!');
    } catch (err: any) {
      toast.error('Failed to generate ad image');
      console.error(err);
    }
    setGenerating(false);
  };

  const downloadAd = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `ad-${listing.mlsNumber || listing.id}.png`;
    a.click();
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-4">
        <Image className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-card-foreground">Generate Graphic Ad</h3>
      </div>

      <div className="mb-4">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Banner Type</label>
        <Select value={bannerType} onValueChange={setBannerType}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {bannerOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Hidden ad template for html2canvas */}
      <div
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 0,
        }}
      >
        <div
          ref={adRef}
          style={{
            width: 540,
            height: 540,
            fontFamily: "'Segoe UI', Arial, sans-serif",
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#1a1a2e',
          }}
        >
          {/* Property photo */}
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              }}
            />
          )}

          {/* Dark overlay for text readability */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.7) 75%, rgba(0,0,0,0.85) 100%)',
            }}
          />

          {/* Red banner */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              backgroundColor: '#cc0000',
              color: '#ffffff',
              textAlign: 'center',
              padding: '12px 20px',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 3,
              textTransform: 'uppercase',
              zIndex: 10,
            }}
          >
            {bannerText}
          </div>

          {/* Property details at bottom */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '20px 24px',
              zIndex: 10,
            }}
          >
            {/* Price */}
            <div
              style={{
                color: '#ffffff',
                fontSize: 36,
                fontWeight: 800,
                marginBottom: 4,
                textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              }}
            >
              {formatListingPrice(listing.price)}
            </div>

            {/* Address */}
            <div
              style={{
                color: '#e0e0e0',
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 10,
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              {fullAddress}
            </div>

            {/* Stats row */}
            <div
              style={{
                display: 'flex',
                gap: 20,
                color: '#ffffff',
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 14,
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              <span>{listing.beds} Beds</span>
              <span>{listing.baths} Baths</span>
              <span>{(listing.sqft || 0).toLocaleString()} Sq Ft</span>
            </div>

            {/* Agent / branding bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: 6,
                padding: '8px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={logo}
                  alt="Logo"
                  style={{ height: 30, borderRadius: 4 }}
                />
                <div>
                  <div style={{ color: '#ffffff', fontSize: 12, fontWeight: 700 }}>
                    {listing.agent?.name || 'Agent'}
                  </div>
                  <div style={{ color: '#bbbbbb', fontSize: 10 }}>
                    {listing.agent?.phone || ''}
                  </div>
                </div>
              </div>
              <div style={{ color: '#cccccc', fontSize: 10 }}>
                MLS# {listing.mlsNumber}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Button onClick={generateAd} disabled={generating} className="w-full mb-4" size="sm">
        {generating ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
        ) : (
          <><Image className="w-4 h-4 mr-2" /> {previewUrl ? 'Regenerate' : 'Generate'} Ad Image</>
        )}
      </Button>

      {previewUrl && (
        <>
          <div className="border border-border rounded-lg overflow-hidden mb-3">
            <img src={previewUrl} alt="Generated ad" className="w-full" />
          </div>
          <Button variant="outline" size="sm" onClick={downloadAd} className="w-full">
            <Download className="w-4 h-4 mr-2" /> Download Ad
          </Button>
        </>
      )}
    </div>
  );
};

export default AdGeneratorPanel;
