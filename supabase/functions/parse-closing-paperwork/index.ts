// Parse closing paperwork PDFs with Claude (Anthropic) and return flat extracted fields.
// Admin-only. Caller passes signed URLs to PDFs in the `closing-paperwork` bucket.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

async function getUserFromAuth(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id || null;
  } catch {
    return null;
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.${userId}&role=eq.admin`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

const TOOL = {
  name: "extract_closing_fields",
  description:
    "Extract closing details from real estate paperwork. Return only fields you find with high confidence; leave unknown fields blank.",
  input_schema: {
    type: "object",
    properties: {
      property_address: { type: "string", description: "Street number and street name only (no city/state/zip)." },
      city: { type: "string" },
      state: { type: "string", description: "Two-letter state code, e.g. OH" },
      zip: { type: "string" },
      closing_date: { type: "string", description: "YYYY-MM-DD format only." },
      sale_price: { type: "number", description: "Final sale/purchase price in USD as a number, no symbols." },
      buyer_names: { type: "string", description: "Comma-separated buyer full names." },
      seller_names: { type: "string", description: "Comma-separated seller full names." },
      lender_name: { type: "string" },
      title_company: { type: "string" },
      listing_agent_name: { type: "string", description: "Listing/seller agent full name." },
      buyer_agent_name: { type: "string", description: "Buyer/selling agent full name." },
    },
    required: [],
    additionalProperties: false,
  },
};

async function fetchPdfAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PDF: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  // Convert in chunks to avoid call-stack issues on large files
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserFromAuth(req.headers.get("Authorization"));
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!(await isAdmin(userId))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { signed_urls } = await req.json();
    if (!Array.isArray(signed_urls) || signed_urls.length === 0) {
      return new Response(JSON.stringify({ error: "signed_urls required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap to 5 PDFs to control cost/latency
    const urls = signed_urls.slice(0, 5);

    const pdfBlocks = await Promise.all(
      urls.map(async (url: string) => {
        const data = await fetchPdfAsBase64(url);
        return {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data },
        };
      }),
    );

    const userContent: any[] = [
      ...pdfBlocks,
      {
        type: "text",
        text:
          "These PDFs are paperwork from a real estate closing (typically the Purchase Contract and related forms). " +
          "Extract the following fields and call extract_closing_fields exactly once. " +
          "Only include fields you find with high confidence. Leave anything unknown blank. " +
          "For property_address return ONLY the street number and street name (do NOT include city/state/zip). " +
          "For closing_date use YYYY-MM-DD. For sale_price return a plain number with no symbols or commas.",
      },
    ];

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "extract_closing_fields" },
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", anthropicRes.status, errText);
      return new Response(
        JSON.stringify({ error: "AI parsing failed", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await anthropicRes.json();
    const toolUse = (result?.content || []).find((b: any) => b.type === "tool_use");
    const extracted = toolUse?.input || {};

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-closing-paperwork error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
