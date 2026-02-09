import { useState, useEffect, useCallback } from 'react';
import { mockMarketingListings, formatListingPrice, MarketingListing } from '@/data/marketingListings';
import { flexmlsApi } from '@/lib/api/flexmls';
import MarketingListingCard from '@/components/dashboard/marketing/MarketingListingCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Search, RefreshCw, Download, Loader2, Wifi, WifiOff } from 'lucide-react';
import { toast } from 'sonner';

const MarketingTab = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [listings, setListings] = useState<MarketingListing[]>(() => {
    try {
      const cached = sessionStorage.getItem('mls_listings');
      if (cached) return JSON.parse(cached);
    } catch {}
    return mockMarketingListings;
  });
  const [isLive, setIsLive] = useState(() => {
    return sessionStorage.getItem('mls_is_live') === 'true';
  });
  const [isSyncing, setIsSyncing] = useState(false);

  const syncFromMLS = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await flexmlsApi.fetchListings({ limit: 100, status: ['active', 'pending', 'contingent'] });
      if (result.success && result.data && result.data.length > 0) {
        setListings(result.data);
        setIsLive(true);
        sessionStorage.setItem('mls_listings', JSON.stringify(result.data));
        sessionStorage.setItem('mls_is_live', 'true');
        toast.success(`Synced ${result.data.length} listings from MLS`);
      } else {
        toast.error(result.error || 'No listings returned. Using demo data.');
        setListings(mockMarketingListings);
        setIsLive(false);
        sessionStorage.removeItem('mls_listings');
        sessionStorage.setItem('mls_is_live', 'false');
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Could not connect to MLS. Using demo data.');
      setListings(mockMarketingListings);
      setIsLive(false);
      sessionStorage.removeItem('mls_listings');
      sessionStorage.setItem('mls_is_live', 'false');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  useEffect(() => {
    const hasCached = sessionStorage.getItem('mls_listings');
    if (!hasCached) {
      syncFromMLS();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = listings.filter(l => {
    const matchesSearch = l.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.mlsNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  
  const activeCount = listings.filter(l => l.status === 'active').length;
  const publishedCount = listings.filter(l => l.published).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="w-6 h-6 text-primary" />
          <div>
            <h3 className="text-lg font-semibold">Columbus Listings</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {isLive ? (
                <><Wifi className="w-3 h-3 text-emerald-500" /> Live · Spark/Flexmls</>
              ) : (
                <><WifiOff className="w-3 h-3 text-amber-500" /> Demo Data · Click Sync</>
              )}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={syncFromMLS}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {isSyncing ? 'Syncing...' : 'Sync MLS'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: 'Total Listings', value: listings.length, sub: isLive ? 'From MLS' : 'Demo data' },
          { label: 'Active', value: activeCount, sub: 'On market' },
          { label: 'Published Sites', value: publishedCount, sub: 'Live websites' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold text-card-foreground mt-1">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search address, city, MLS#..."
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
              <SelectItem value="sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const exportListings = listings.filter(l => ['active', 'pending', 'contingent'].includes(l.status));
            if (exportListings.length === 0) {
              toast.error('No listings to export. Sync MLS first.');
              return;
            }

            const headers = ['MLS Number', 'Address', 'City', 'State', 'Zip', 'Listing Price', 'Status', 'Total Bedrooms', 'Total Bathrooms', 'Sq Ft', 'Year Built', 'Property Type', 'Lot Size', 'Days on Market', 'Listing Agent', 'Agent Phone', 'Agent Email'];
            const rows = exportListings.map(l => [
              l.mlsNumber, l.address, l.city, l.state, l.zip,
              l.price, l.status, l.beds, l.baths, l.sqft,
              l.yearBuilt, l.propertyType, l.lotSize, l.daysOnMarket,
              l.agent.name, l.agent.phone, l.agent.email,
            ].map(v => {
              const s = String(v ?? '');
              return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
            }));

            const bom = '\uFEFF';
            const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `office-listings-${exportListings.length}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`Exported ${exportListings.length} listings (active, pending, contingent)`);
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          Export Excel
        </Button>
      </div>

      {/* Listing Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((listing) => (
          <MarketingListingCard key={listing.id} listing={listing} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted-foreground text-lg">No listings match your search.</p>
        </div>
      )}
    </div>
  );
};

export default MarketingTab;
