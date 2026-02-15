import { useState, useEffect, useCallback } from 'react';
import { mockMarketingListings, formatListingPrice, MarketingListing } from '@/data/marketingListings';
import { flexmlsApi } from '@/lib/api/flexmls';
import MarketingListingCard from '@/components/dashboard/marketing/MarketingListingCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Search, RefreshCw, Download, Loader2, Wifi, WifiOff, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const MarketingTab = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('status-price');
  const CACHE_KEY = 'mls_listings_cache';

  const [listings, setListings] = useState<MarketingListing[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data } = JSON.parse(raw);
        if (data?.length) return data;
      }
    } catch {}
    return mockMarketingListings;
  });
  const [isLive, setIsLive] = useState(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data } = JSON.parse(raw);
        return data?.length > 0;
      }
    } catch {}
    return false;
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const { data: lastSyncedFromDb } = useQuery({
    queryKey: ['mls-last-sync'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sync_log')
        .select('synced_at, record_count')
        .eq('sync_type', 'mls_listings')
        .order('synced_at', { ascending: false })
        .limit(1)
        .single();
      return data?.synced_at || null;
    },
    refetchInterval: 60000,
  });
  const lastSynced = lastSyncedFromDb ?? null;

  const syncFromMLS = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await flexmlsApi.fetchListings({ limit: 200, status: ['active', 'pending', 'contingent'] });
      if (result.success && result.data && result.data.length > 0) {
        setListings(result.data);
        setIsLive(true);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result.data, timestamp: new Date().toISOString() }));
        queryClient.invalidateQueries({ queryKey: ['mls-last-sync'] });
      } else {
        toast.error(result.error || 'No listings returned. Using cached data.');
        setIsLive(false);
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Could not connect to MLS. Using cached data.');
      setIsLive(false);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Always background-sync on mount so new listings appear immediately
  useEffect(() => {
    syncFromMLS();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusOrder: Record<string, number> = { active: 0, contingent: 1, pending: 2, sold: 3 };

  const filtered = listings.filter(l => {
    const matchesSearch = l.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.mlsNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'price-high':
        return b.price - a.price;
      case 'price-low':
        return a.price - b.price;
      case 'days-market':
        return b.daysOnMarket - a.daysOnMarket;
      case 'status-price':
      default:
        const statusDiff = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
        return statusDiff !== 0 ? statusDiff : b.price - a.price;
    }
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
        <div className="flex flex-col items-end gap-1">
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
          <p className="text-[10px] text-muted-foreground">
            {lastSynced
              ? `Last synced: ${new Date(lastSynced).toLocaleString()}`
              : 'Not yet synced this session'}
          </p>
        </div>
      </div>
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
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="status-price">Status & Price</SelectItem>
              <SelectItem value="price-high">Price: High to Low</SelectItem>
              <SelectItem value="price-low">Price: Low to High</SelectItem>
              <SelectItem value="days-market">Days on Market</SelectItem>
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

            const headers = ['MLS Number', 'Address', 'City', 'State', 'Zip', 'Listing Price', 'Status', 'Total Bedrooms', 'Total Bathrooms', 'Sq Ft', 'Year Built', 'Property Type', 'Lot Size', 'Days on Market', 'Listing Agent', 'Agent Phone', 'Agent Email', 'Remarks', 'School District'];
            const agentPhoneMap: Record<string, string> = {
              'David E Barlow': '614-778-6616',
              'Jaysen E Barlow': '614-579-1442',
              'Jaime Barlow': '614-493-8541',
              'Jaime E Barlow': '614-493-8541',
            };
            const rows = exportListings.map(l => {
              const phone = (l.agent.phone && !/^\*+$/.test(l.agent.phone))
                ? l.agent.phone
                : agentPhoneMap[l.agent.name] || l.agent.phone;
              return [
                l.mlsNumber, l.address, l.city, l.state, l.zip,
                l.price, l.status, l.beds, l.baths, l.sqft,
                l.yearBuilt, l.propertyType, l.lotSize, l.daysOnMarket,
                l.agent.name, phone, l.agent.email, l.description, l.schoolDistrict,
              ].map(v => {
                const s = String(v ?? '');
                return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
              });
            });

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
