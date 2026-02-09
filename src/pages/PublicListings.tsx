import { useState, useEffect, useCallback } from 'react';
import { mockMarketingListings, formatListingPrice, MarketingListing } from '@/data/marketingListings';
import { flexmlsApi } from '@/lib/api/flexmls';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, MapPin, Bed, Bath, Maximize } from 'lucide-react';
import { Link } from 'react-router-dom';
import logo from '@/assets/logo.jpg';

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  contingent: 'bg-blue-100 text-blue-800 border-blue-200',
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  sold: 'bg-red-100 text-red-800 border-red-200',
};

const PublicListings = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [listings, setListings] = useState<MarketingListing[]>(() => {
    try {
      const cached = sessionStorage.getItem('public_mls_listings');
      if (cached) return JSON.parse(cached);
    } catch {}
    return mockMarketingListings;
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await flexmlsApi.fetchListings({ limit: 100, status: ['active', 'pending', 'contingent'] });
      if (result.success && result.data && result.data.length > 0) {
        setListings(result.data);
        sessionStorage.setItem('public_mls_listings', JSON.stringify(result.data));
      } else {
        setListings(mockMarketingListings);
      }
    } catch {
      setListings(mockMarketingListings);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const hasCached = sessionStorage.getItem('public_mls_listings');
    if (!hasCached) fetchListings();
  }, [fetchListings]);

  const filtered = listings
    .filter(l => ['active', 'pending', 'contingent'].includes(l.status))
    .filter(l => {
      const matchesSearch = l.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.city.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src={logo} alt="Sell for 1 Percent" className="h-10 w-auto" />
            <div>
              <h1 className="text-lg font-bold">Our Listings</h1>
              <p className="text-xs text-muted-foreground">Browse available properties</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Hero */}
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Find Your Next Home</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Browse our current listings across the Columbus metro area.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-8 max-w-2xl mx-auto">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by address or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="contingent">Contingent</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results count */}
        <p className="text-sm text-muted-foreground mb-6">{filtered.length} listing{filtered.length !== 1 ? 's' : ''} found</p>

        {/* Listing Grid */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading listings...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((listing) => (
              <Link
                key={listing.id}
                to={`/listing/${listing.id}`}
                className="block group bg-card rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-border"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {listing.photos?.[0] ? (
                    <img
                      src={listing.photos[0]}
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
                  <div className="pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">{listing.mlsNumber} · {listing.daysOnMarket}d on market</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">No listings match your search.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-card/50 mt-16 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Sell for 1 Percent. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicListings;
