import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShowingData {
  totalShowings: number | null;
  showingsThisWeek: number | null;
  lastShowingDate: string | null;
  feedback: string[];
  error: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mls_id, property_address, debug_login_page } = await req.json();

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    const stUsername = Deno.env.get("SHOWINGTIME_USERNAME");
    const stPassword = Deno.env.get("SHOWINGTIME_PASSWORD");

    if (!apiKey) {
      console.error("FIRECRAWL_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Firecrawl API key not configured", data: null }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Debug mode: scrape the actual ShowingTime login page
    if (debug_login_page) {
      console.log("Debug mode: scraping ShowingTime login page structure");
      
      // The actual ShowingTime login appears to be at showingtimeplus.com
      const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://showingtimeplus.com/solutions/showings-and-offers/showingtime/login",
          formats: ["markdown", "html"],
          onlyMainContent: false,
          waitFor: 5000,
        }),
      });

      const fcData = await fcRes.json();
      const markdown = fcData?.data?.markdown ?? "";
      const html = fcData?.data?.html ?? "";
      
      console.log("Login page markdown:", markdown.substring(0, 4000));
      
      return new Response(JSON.stringify({ 
        markdown: markdown.substring(0, 6000),
        html: html.substring(0, 10000),
        success: fcData?.success 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!mls_id && !property_address) {
      return new Response(
        JSON.stringify({ error: "MLS ID or property address required", data: null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!stUsername || !stPassword) {
      console.error("ShowingTime credentials not configured");
      return new Response(
        JSON.stringify({ error: "ShowingTime credentials not configured", data: null }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Logging into ShowingTime for MLS:", mls_id);

    // Use the correct ShowingTime login URL
    const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://showingtimeplus.com/solutions/showings-and-offers/showingtime/login",
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 5000,
        actions: [
          // Wait for page to fully load
          { type: "wait", milliseconds: 4000 },
          // Type username - use Tab to navigate between fields
          { type: "write", text: stUsername },
          { type: "press", key: "Tab" },
          { type: "wait", milliseconds: 500 },
          // Type password
          { type: "write", text: stPassword },
          { type: "wait", milliseconds: 500 },
          // Submit the form
          { type: "press", key: "Enter" },
          // Wait for login to complete
          { type: "wait", milliseconds: 10000 },
          // Screenshot to see result
          { type: "screenshot" },
        ],
      }),
    });

    const fcData = await fcRes.json();
    console.log("Firecrawl response status:", fcRes.status);
    console.log("Firecrawl success:", fcData?.success);

    if (!fcRes.ok || fcData?.success === false) {
      console.error("Firecrawl ShowingTime error:", JSON.stringify(fcData));
      return new Response(
        JSON.stringify({
          error: fcData?.error || `Firecrawl request failed: ${fcRes.status}`,
          data: null,
          debug: fcData?.details || null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const markdown = fcData?.data?.markdown ?? fcData?.markdown ?? "";
    console.log("ShowingTime page length:", markdown.length);
    console.log("ShowingTime content:", markdown.substring(0, 3000));

    // Parse showing data from the page content
    const data: ShowingData = {
      totalShowings: null,
      showingsThisWeek: null,
      lastShowingDate: null,
      feedback: [],
      error: null,
    };

    // Check if we're still on login page (login failed)
    const lowerMarkdown = markdown.toLowerCase();
    if (lowerMarkdown.includes("sign in") || lowerMarkdown.includes("forgot password") || 
        (lowerMarkdown.includes("password") && lowerMarkdown.includes("email"))) {
      data.error = "Login may have failed - still seeing login page. Please verify credentials.";
      console.log("Detected login page content - credentials may be incorrect");
    } else {
      // Try to extract total showings - be more specific to avoid matching years like "2025"
      // Look for patterns like "8 Showings" or "Total Showings: 8" or "8 total showings"
      // Exclude matches where the number is 4 digits (likely a year)
      const totalMatch = markdown.match(/(?:total\s+showings?[:\s]*(\d{1,3})|(\d{1,3})\s+total\s+showings?|^(\d{1,3})\s+showings?(?!\s*\d)|showings?[:\s]*(\d{1,3})(?!\d))/im);
      if (totalMatch) {
        // Find the first captured group that has a value
        const showingCount = totalMatch[1] || totalMatch[2] || totalMatch[3] || totalMatch[4];
        if (showingCount) {
          const parsed = parseInt(showingCount, 10);
          // Sanity check: if the number is >= 1000, it's probably a year or invalid
          if (parsed < 1000) {
            data.totalShowings = parsed;
          }
        }
      }

      // Try to extract recent/this week showings
      const weekMatch = markdown.match(/(\d+)\s*showings?\s*(?:this\s*week|last\s*7\s*days|recent)/i);
      if (weekMatch) {
        const parsed = parseInt(weekMatch[1], 10);
        // Sanity check
        if (parsed < 1000) {
          data.showingsThisWeek = parsed;
        }
      }

      // Try to extract last showing date
      const dateMatch = markdown.match(/(?:last|recent|latest)\s*(?:showing)?[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})/i);
      if (dateMatch) {
        data.lastShowingDate = dateMatch[1];
      }

      // Extract feedback snippets
      const feedbackMatches = markdown.matchAll(/feedback[:\s]*["']?([^"'\n]{10,200})["']?/gi);
      for (const match of feedbackMatches) {
        if (match[1] && data.feedback.length < 5) {
          data.feedback.push(match[1].trim());
        }
      }

      if (!data.totalShowings && !data.showingsThisWeek && !data.lastShowingDate) {
        data.error = "Could not extract showing data - page structure may have changed";
      }
    }

    console.log("Parsed ShowingTime data:", data);

    return new Response(JSON.stringify({ data, error: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching ShowingTime:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        data: null,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
