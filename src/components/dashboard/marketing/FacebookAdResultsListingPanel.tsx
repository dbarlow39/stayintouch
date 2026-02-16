import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart3, Loader2, Facebook, Download, Plus } from 'lucide-react';
import { toast } from 'sonner';
import FacebookAdResults from './FacebookAdResults';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  const [importing, setImporting] = useState(false);
  const [manualPostId, setManualPostId] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const fetchPosts = async () => {
    if (!user) return;
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
  };

  useEffect(() => {
    fetchPosts();
  }, [user, listingId]);

  const importFromFacebook = async () => {
    if (!user) return;
    setImporting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/facebook-import-posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({ agent_id: user.id }),
      });
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      toast.success(`Imported ${result.imported} posts from Facebook (${result.total_found} found, ${result.already_tracked} already tracked)`);
      await fetchPosts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import posts');
    }
    setImporting(false);
  };

  const addManualPost = async () => {
    if (!user || !manualPostId.trim()) return;
    try {
      await supabase.from('facebook_ad_posts' as any).insert({
        agent_id: user.id,
        listing_id: listingId,
        listing_address: listingAddress,
        post_id: manualPostId.trim(),
        daily_budget: 0,
        duration_days: 0,
        status: 'manual',
      });
      toast.success('Post added! Fetching results...');
      setManualPostId('');
      setShowManualInput(false);
      await fetchPosts();
    } catch (err: any) {
      toast.error('Failed to add post');
    }
  };

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
        <div className="text-center py-6 space-y-3">
          <Facebook className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            No Facebook posts tracked for this listing.
          </p>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={importFromFacebook}
              disabled={importing}
              className="w-full"
            >
              {importing ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing...</>
              ) : (
                <><Download className="w-3.5 h-3.5 mr-1.5" /> Import from Facebook (Last 30 days)</>
              )}
            </Button>

            {!showManualInput ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowManualInput(true)}
                className="w-full text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Post ID Manually
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={manualPostId}
                  onChange={(e) => setManualPostId(e.target.value)}
                  placeholder="Facebook Post ID (e.g. 123456_789012)"
                  className="text-xs"
                />
                <Button size="sm" onClick={addManualPost} disabled={!manualPostId.trim()}>
                  Add
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      {/* Actions bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {posts.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {posts.length} posts tracked
            </p>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={importFromFacebook}
            disabled={importing}
            className="h-7 text-xs"
          >
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowManualInput(!showManualInput)}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {showManualInput && (
        <div className="flex gap-2 mb-3">
          <Input
            value={manualPostId}
            onChange={(e) => setManualPostId(e.target.value)}
            placeholder="Facebook Post ID"
            className="text-xs"
          />
          <Button size="sm" onClick={addManualPost} disabled={!manualPostId.trim()}>
            Add
          </Button>
        </div>
      )}

      {/* Post selector if multiple posts */}
      {posts.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
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
