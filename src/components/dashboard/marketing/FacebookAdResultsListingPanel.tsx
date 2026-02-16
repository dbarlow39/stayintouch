import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { BarChart3, Loader2, Facebook } from 'lucide-react';
import FacebookAdResults from './FacebookAdResults';

interface FacebookAdResultsListingPanelProps {
  listingId: string;
  listingAddress: string;
}

interface AdPost {
  id: string;
  post_id: string;
  listing_address: string;
  status: string;
  daily_budget: number;
  duration_days: number;
  boost_started_at: string;
}

const FacebookAdResultsListingPanel = ({ listingId, listingAddress }: FacebookAdResultsListingPanelProps) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<AdPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('facebook_ad_posts' as any)
          .select('*')
          .eq('agent_id', user.id)
          .eq('listing_id', listingId)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setPosts(data as any as AdPost[]);
          if ((data as any[]).length > 0) {
            setSelectedPostId((data as any[])[0].post_id);
          }
        }
      } catch (err) {
        console.error('[AdResults] Error fetching posts:', err);
      }
      setLoading(false);
    })();
  }, [user, listingId]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-card-foreground">Ad Results</h3>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-card-foreground">Ad Results</h3>
        </div>
        <div className="text-center py-6">
          <Facebook className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No Facebook posts found for this listing.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Post to Facebook first to see ad performance here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      {/* Post selector if multiple posts */}
      {posts.length > 1 && (
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {posts.length} posts for this listing
          </p>
          <div className="flex flex-wrap gap-2">
            {posts.map((post) => (
              <Button
                key={post.id}
                variant={selectedPostId === post.post_id ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => setSelectedPostId(post.post_id)}
              >
                {new Date(post.boost_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {post.status === 'boosted' && ` · $${post.daily_budget}/day`}
              </Button>
            ))}
          </div>
        </div>
      )}

      {selectedPostId && (
        <FacebookAdResults
          postId={selectedPostId}
          listingAddress={listingAddress}
        />
      )}
    </div>
  );
};

export default FacebookAdResultsListingPanel;
