import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id } = await req.json();
    if (!agent_id) throw new Error("agent_id is required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get Facebook page token
    const { data: tokenData, error: tokenError } = await supabase
      .from("facebook_oauth_tokens")
      .select("page_access_token, page_id, page_name")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData?.page_access_token || !tokenData?.page_id) {
      throw new Error("Facebook not connected or page token missing");
    }

    const pageToken = tokenData.page_access_token;
    const pageId = tokenData.page_id;

    // Calculate 30 days ago as unix timestamp
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

    // Fetch recent page posts (last 30 days)
    const postsUrl = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,message,created_time,full_picture,is_published&since=${since}&limit=100&access_token=${pageToken}`;
    const postsResp = await fetch(postsUrl);
    const postsData = await postsResp.json();

    if (postsData.error) {
      console.error("[fb-import] API error:", postsData.error);
      throw new Error(postsData.error.message || "Failed to fetch page posts");
    }

    const posts = postsData.data || [];
    console.log(`[fb-import] Found ${posts.length} posts from last 30 days`);

    // Get existing tracked post IDs to avoid duplicates
    const { data: existingPosts } = await supabase
      .from("facebook_ad_posts")
      .select("post_id")
      .eq("agent_id", agent_id);

    const existingPostIds = new Set((existingPosts || []).map((p: any) => p.post_id));

    // Filter out already-tracked posts
    const newPosts = posts.filter((p: any) => !existingPostIds.has(p.id));
    console.log(`[fb-import] ${newPosts.length} new posts to import`);

    // Try to match posts to listings by looking for address patterns in the message
    const imported: any[] = [];
    for (const post of newPosts) {
      const message = post.message || "";

      // Insert each post - we'll use a generic listing_id since we can't perfectly match
      const record: any = {
        agent_id,
        listing_id: post.id, // Use post ID as listing_id if we can't match
        listing_address: extractAddress(message) || "Facebook Page Post",
        post_id: post.id,
        daily_budget: 0,
        duration_days: 0,
        status: "imported",
        boost_started_at: post.created_time || new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from("facebook_ad_posts")
        .insert(record);

      if (!insertError) {
        imported.push({
          post_id: post.id,
          message: message.substring(0, 100),
          created_time: post.created_time,
          address: record.listing_address,
        });
      } else {
        console.error(`[fb-import] Insert error for ${post.id}:`, insertError);
      }
    }

    return new Response(
      JSON.stringify({
        total_found: posts.length,
        already_tracked: existingPostIds.size,
        imported: imported.length,
        posts: imported,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fb-import] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Try to extract an address from a Facebook post message.
 * Looks for patterns like "📍 123 Main St, City, ST 12345"
 */
function extractAddress(message: string): string | null {
  // Try emoji-prefixed address pattern
  const emojiMatch = message.match(/📍\s*(.+?)(?:\n|$)/);
  if (emojiMatch) return emojiMatch[1].trim();

  // Try "NEW LISTING" or "JUST SOLD" followed by address on next line
  const listingMatch = message.match(/(?:NEW LISTING|JUST SOLD|FOR SALE)[!]*\s*\n+\s*📍?\s*(.+?)(?:\n|$)/i);
  if (listingMatch) return listingMatch[1].trim();

  // Try generic address pattern (number + street)
  const addrMatch = message.match(/(\d+\s+[A-Za-z][\w\s]+(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Ct|Court|Way|Blvd|Boulevard|Pl|Place|Cir|Circle)[.,]?\s*[A-Za-z\s]+,?\s*[A-Z]{2}\s*\d{5})/i);
  if (addrMatch) return addrMatch[1].trim();

  return null;
}
