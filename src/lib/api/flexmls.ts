import { supabase } from '@/integrations/supabase/client';
import { MarketingListing } from '@/data/marketingListings';

let _metadataCache: { data: any; timestamp: number } | null = null;
const CACHE_TTL = 1000 * 60 * 60;

export interface MlsMetadata {
  labels: Record<string, string>;
  propertyTypes: Record<string, string>;
}

export const flexmlsApi = {
  async fetchListings(params?: { status?: string | string[]; limit?: number }): Promise<{
    success: boolean;
    data?: MarketingListing[];
    total?: number;
    error?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('flexmls-sync', {
      body: { action: 'my_listings', params },
    });

    if (error) {
      console.error('Edge function error:', error);
      return { success: false, error: error.message };
    }

    return data;
  },

  async fetchSingleListing(listingId: string): Promise<{
    success: boolean;
    data?: MarketingListing;
    error?: string;
  }> {
    const { data, error } = await supabase.functions.invoke('flexmls-sync', {
      body: { action: 'single_listing', params: { listingId } },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return data;
  },

  async fetchMetadata(): Promise<{
    success: boolean;
    data?: MlsMetadata;
    error?: string;
  }> {
    if (_metadataCache && Date.now() - _metadataCache.timestamp < CACHE_TTL) {
      return { success: true, data: _metadataCache.data };
    }

    const { data, error } = await supabase.functions.invoke('flexmls-sync', {
      body: { action: 'standardfields' },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data?.success && data.data) {
      _metadataCache = { data: data.data, timestamp: Date.now() };
    }

    return data;
  },
};
