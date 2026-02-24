import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agent_id, message, photo_url, link } = await req.json();

    if (!agent_id || !message) {
      throw new Error("agent_id and message are required");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get stored tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("facebook_oauth_tokens")
      .select("*")
      .eq("agent_id", agent_id)
      .single();

    if (tokenError || !tokenData) {
      throw new Error("Facebook not connected. Please connect your Facebook Page first.");
    }

    const { page_id, page_access_token, instagram_account_id } = tokenData;

    if (!page_id || !page_access_token) {
      throw new Error("Facebook Page not configured. Please reconnect.");
    }

    let result;
    let warning: string | undefined;

    if (link) {
      // Link share post — creates a clickable card on Facebook with OG metadata
      // Pre-scrape with HEAD request verification and retries
      let scrapedSuccessfully = false;
      let retries = 0;
      const MAX_RETRIES = 1;
      
      // Verify image URL is accessible and scrape the link for og:image
      if (link.includes("&image=")) {
        while (retries < MAX_RETRIES && !scrapedSuccessfully) {
          try {
            const headResp = await fetch(link, { method: "HEAD" });
            if (headResp.ok) {
              // URL is accessible, now scrape it
              const scrapeResp = await fetch(
                `https://graph.facebook.com/?id=${encodeURIComponent(link)}&scrape=true`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                }
              );
              scrapedSuccessfully = scrapeResp.ok;
              if (scrapedSuccessfully) {
                console.log("[facebook-post] Pre-scrape successful for link:", link);
              }
            }
          } catch (scrapeErr) {
            console.error(`[facebook-post] Scrape attempt ${retries + 1} failed:`, scrapeErr);
          }
          
          if (!scrapedSuccessfully && retries < MAX_RETRIES - 1) {
            // Wait 2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
            retries++;
          } else {
            break;
          }
        }
        
        if (!scrapedSuccessfully) {
          console.warn("[facebook-post] Pre-scrape failed after retries, posting anyway");
          warning = "Post published but the preview image may take a moment to appear. You can refresh it from Facebook.";
        }
      }

      // Post the link with OG metadata
      const body: any = {
        message,
        link,
        access_token: page_access_token,
      };

      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      result = await postResp.json();
    } else if (photo_url) {
      // Photo-only post (no link)
      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: photo_url,
          message,
          access_token: page_access_token,
        }),
      });
      result = await postResp.json();
    } else {
      // Text-only post
      const postResp = await fetch(`https://graph.facebook.com/v21.0/${page_id}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          access_token: page_access_token,
        }),
      });
      result = await postResp.json();
    }

    if (result.error) {
      console.error("Facebook post error:", result.error);
      throw new Error(result.error.message || "Failed to post to Facebook");
    }

    // Facebook returns 'id' for feed posts, 'post_id' for photo posts
    const finalPostId = result.post_id || result.id;
    console.log("[facebook-post] Result:", JSON.stringify(result), "Final post_id:", finalPostId);

    // Cross-post to Instagram if connected
    let instagramPostId: string | null = null;
    let instagramWarning: string | undefined;
    if (instagram_account_id) {
      try {
        console.log("[facebook-post] Cross-posting to Instagram, account:", instagram_account_id);
        const imageUrl = photo_url || (link && link.includes("&image=") ? decodeURIComponent(link.split("&image=")[1]?.split("&")[0] || "") : null);
        
        if (imageUrl) {
          // Step 1: Create media container
          const containerBody: any = {
            image_url: imageUrl,
            caption: message,
            access_token: page_access_token,
          };

          const containerResp = await fetch(`https://graph.facebook.com/v21.0/${instagram_account_id}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(containerBody),
          });
          const containerData = await containerResp.json();
          console.log("[facebook-post] IG container response:", JSON.stringify(containerData));

          if (containerData.id) {
            // Step 2: Wait 10 seconds for Instagram to process, then publish once
            console.log("[facebook-post] Waiting 10s for IG media processing...");
            await new Promise(resolve => setTimeout(resolve, 10000));

            const publishResp = await fetch(`https://graph.facebook.com/v21.0/${instagram_account_id}/media_publish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                creation_id: containerData.id,
                access_token: page_access_token,
              }),
            });
            const publishData = await publishResp.json();
            console.log("[facebook-post] IG publish response:", JSON.stringify(publishData));

            if (publishData.id) {
              instagramPostId = publishData.id;
              console.log("[facebook-post] Instagram post published:", instagramPostId);
            } else if (publishData.error) {
              instagramWarning = "Instagram publish failed: " + (publishData.error.message || "Unknown error");
              console.error("[facebook-post] IG publish error:", publishData.error);
            }
          } else if (containerData.error) {
            instagramWarning = "Instagram post failed: " + (containerData.error.message || "Unknown error");
            console.error("[facebook-post] IG container error:", containerData.error);
          }
        } else {
          instagramWarning = "Instagram requires an image — text-only posts skipped for Instagram.";
          console.log("[facebook-post] Skipping Instagram: no image available");
        }
      } catch (igErr) {
        instagramWarning = "Instagram cross-post failed: " + (igErr instanceof Error ? igErr.message : "Unknown error");
        console.error("[facebook-post] Instagram error:", igErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      post_id: finalPostId,
      instagram_post_id: instagramPostId,
      warning: warning || instagramWarning || undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Facebook post error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
