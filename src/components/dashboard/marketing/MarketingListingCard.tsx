import { MarketingListing, formatListingPrice } from '@/data/marketingListings';
import { Badge } from '@/components/ui/badge';
import { MapPin, Bed, Bath, Maximize, Globe, MoreVertical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  contingent: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  sold: 'bg-red-100 text-red-800 border-red-200',
  draft: 'bg-muted text-muted-foreground border-border',
};

interface MarketingListingCardProps {
  listing: MarketingListing;
}

const MarketingListingCard = ({ listing }: MarketingListingCardProps) => {
  const image = listing.photos?.[0];

  return (
    <Link to={`/listing/${listing.id}`} className="block group bg-card rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-border">
      <div className="relative aspect-[16/10] overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={listing.address}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground text-sm">No Photo</span>
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className={`inline-block px-2.5 py-1 text-xs font-medium rounded-full border ${statusStyles[listing.status]}`}>
            {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
          </span>
        </div>
        {listing.published && (
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-accent text-accent-foreground">
              <Globe className="w-3 h-3" /> Live
            </span>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
          <p className="text-2xl font-bold text-white">{formatListingPrice(listing.price)}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-lg font-semibold text-card-foreground leading-tight">{listing.address}</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" />
            {listing.city}, {listing.state} {listing.zip}
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1"><Bed className="w-4 h-4" /> {listing.beds} Beds</span>
          <span className="flex items-center gap-1"><Bath className="w-4 h-4" /> {listing.baths} Baths</span>
          <span className="flex items-center gap-1"><Maximize className="w-4 h-4" /> {listing.sqft.toLocaleString()} sqft</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">{listing.mlsNumber} · {listing.daysOnMarket}d on market</span>
        </div>
      </div>
    </Link>
  );
};

export default MarketingListingCard;
