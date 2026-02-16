import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BarChart3, Loader2, Facebook, Download, Plus, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import FacebookAdResults from './FacebookAdResults';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface AdPost {
  id: string;
  post_id: string;
  listing_id: string;
  listing_address: string;
  status: string;
  daily_budget: number;
  duration_days: number;
  boost_started_at: string;
}

const FacebookAdResultsDashboard = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<AdPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [manualPostId, setManualPostId] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const fetchPosts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('facebook_ad_posts' as any)
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPosts(data as any as AdPost[]);
      }
    } catch (err) {
      console.error('[AdDashboard] Error:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPosts();
  }, [user]);

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
      toast.success(`Imported ${result.imported} posts from Facebook`);
      await fetchPosts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import');
    }
    setImporting(false);
  };

  const addManualPost = async () => {
    if (!user || !manualPostId.trim()) return;
    try {
      await supabase.from('facebook_ad_posts' as any).insert({
        agent_id: user.id,
        listing_id: manualPostId.trim(),
        listing_address: manualAddress.trim() || 'Facebook Post',
        post_id: manualPostId.trim(),
        daily_budget: 0,
        duration_days: 0,
        status: 'manual',
      });
      toast.success('Post added!');
      setManualPostId('');
      setManualAddress('');
      setShowManualInput(false);
      await fetchPosts();
    } catch (err: any) {
      toast.error('Failed to add post');
    }
  };

  // If viewing a specific post's results
  if (selectedPostId) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedPostId(null)}>
          ← Back to All Posts
        </Button>
        <div className="bg-card border border-border rounded-lg p-5">
          <FacebookAdResults
            postId={selectedPostId}
            listingAddress={selectedAddress}
            onClose={() => setSelectedPostId(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-bold text-card-foreground">Facebook Ad Results</h3>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={importFromFacebook}
            disabled={importing}
          >
            {importing ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Importing...</>
            ) : (
              <><Download className="w-3.5 h-3.5 mr-1.5" /> Import from Facebook</>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualInput(!showManualInput)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Post ID
          </Button>
        </div>
      </div>

      {showManualInput && (
        <div className="bg-card border border-border rounded-lg p-4 flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Post ID</label>
            <Input
              value={manualPostId}
              onChange={(e) => setManualPostId(e.target.value)}
              placeholder="e.g. 123456789_987654321"
              className="text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">Property Address (optional)</label>
            <Input
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Columbus, OH"
              className="text-sm"
            />
          </div>
          <Button size="sm" onClick={addManualPost} disabled={!manualPostId.trim()}>
            Add
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Facebook className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-1">No tracked Facebook posts yet.</p>
          <p className="text-xs text-muted-foreground">
            Click "Import from Facebook" to pull in your last 30 days of page posts, or add a post ID manually.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => {
                setSelectedPostId(post.post_id);
                setSelectedAddress(post.listing_address);
              }}
              className="w-full bg-card border border-border rounded-lg p-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-card-foreground truncate">
                  {post.listing_address}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.boost_started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    post.status === 'boosted' ? 'bg-blue-100 text-blue-700' :
                    post.status === 'organic' ? 'bg-emerald-100 text-emerald-700' :
                    post.status === 'imported' ? 'bg-amber-100 text-amber-700' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {post.status}
                  </span>
                  {post.daily_budget > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ${post.daily_budget}/day · {post.duration_days}d
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FacebookAdResultsDashboard;
