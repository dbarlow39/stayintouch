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
      title_company: { type: "string", description: "Full name of the title company handling closing (e.g. 'Caliber Title Agency LLC')." },
      caliber_title_detected: {
        type: "boolean",
        description: "Set TRUE if ANY page of the paperwork shows 'Caliber Title' / 'Caliber Title Agency' (text), or the Caliber shield logo (three overlapping shields with 'CALIBER' across the front and 'TITLE AGENCY LLC' beneath). Check headers, footers, the ABA / Affiliated Business Arrangement form, settlement statements, and the first page especially. Otherwise omit.",
      },
      listing_agent_name: { type: "string", description: "Listing/seller agent full name. PRIORITIZE the value typed/written on the 'Seller's Agent:' line on page 1 of the closing package. Also check signature blocks, 'Listing Brokerage', 'Listing Broker', and the agent line on the Agency Disclosure / Settlement Statement." },
      buyer_agent_name: { type: "string", description: "Buyer/selling agent full name. PRIORITIZE the value typed/written on the 'Buyer's Agent:' line on page 1 of the closing package. Also check signature blocks, 'Selling Brokerage', 'Cooperating Broker', and the agent line on the Agency Disclosure / Settlement Statement. If multiple names are present (e.g. 'Shayne Boyd/Rhiannon Ferrari'), keep them joined as-is." },
      built_before_1978: {
        type: "boolean",
        description: "True ONLY if the paperwork explicitly states the home was built before 1978 (e.g. on the Lead Based Paint Disclosure or Residential Property Disclosure year-built field). Otherwise omit.",
      },
      checklist_detected: {
        type: "object",
        description: "For each document type, set to TRUE only if you find a clearly identifiable copy of that document in the uploaded PDFs (signed or unsigned). Omit fields you can't confirm.",
        properties: {
          consumer_guide: { type: "boolean", description: "Ohio 'Consumer Guide to Agency Relationships' or similar consumer guide." },
          agency_disclosure: { type: "boolean", description: "Agency Disclosure Statement." },
          signed_contract: { type: "boolean", description: "A purchase contract / Residential Real Estate Purchase Agreement that has been signed AND dated by the parties." },
          representation_agreement: { type: "boolean", description: "Either the Exclusive Right to Sell listing agreement OR the Buyer Representation/Agency Agreement." },
          residential_property_disclosure: { type: "boolean", description: "Residential Property Disclosure Form." },
          lead_based_paint_disclosure: { type: "boolean", description: "Set TRUE if any page contains the form titled 'Disclosure of Information on Lead-Based Paint and/or Lead-Based Paint Hazards' (or substantially similar). This form typically includes a 'Lead Warning Statement', a 'Seller's Disclosure' section with checkboxes (a)(i)/(ii) and (b)(i)/(ii), a 'Purchaser's Acknowledgment' section, an 'Agent's Acknowledgment' section, and a 'Certification of Accuracy' with signatures. Mark TRUE whenever this form is present, signed or unsigned, regardless of whether the home was built before 1978." },
          affiliated_business_arrangement: { type: "boolean", description: "Affiliated Business Arrangement Disclosure Statement (ABA)." },
          home_inspection: { type: "boolean", description: "Evidence the buyer obtained a home inspection (inspection report, inspection response/remedy form, or inspection waiver)." },
          settlement_statement: { type: "boolean", description: "Closing Disclosure (CD), ALTA Settlement Statement, or HUD-1." },
        },
        additionalProperties: false,
      },
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

    const { signed_urls, representation } = await req.json();
    if (!Array.isArray(signed_urls) || signed_urls.length === 0) {
      return new Response(JSON.stringify({ error: "signed_urls required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const repr = representation === "seller" || representation === "buyer" ? representation : null;

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

    const reprNote = repr === "seller"
      ? "The agent using this system is REPRESENTING THE SELLER on this transaction. The expected paperwork set typically includes the Listing Agreement, Seller's Disclosure, Lead-Based Paint Disclosure, Purchase Contract (seller-signed), Counter-Offers/Addenda, and the Closing Disclosure / Settlement Statement (seller side). When extracting agent names, prioritize the listing/seller-side agent for matching."
      : repr === "buyer"
      ? "The agent using this system is REPRESENTING THE BUYER on this transaction. The expected paperwork set typically includes the Buyer Agency Agreement, Purchase Contract (buyer-signed), Pre-Approval Letter, Inspection Response/Remedy, Loan/Appraisal Addenda, and the Closing Disclosure / Settlement Statement (buyer side). When extracting agent names, prioritize the buyer/selling-side agent for matching."
      : "Representation side was not specified.";

    const userContent: any[] = [
      ...pdfBlocks,
      {
        type: "text",
        text:
          "These PDFs are paperwork from a real estate closing (typically the Purchase Contract and related forms). " +
          reprNote + " " +
          "Extract the following fields and call extract_closing_fields exactly once. " +
          "Only include fields you find with high confidence. Leave anything unknown blank. " +
          "ALWAYS populate city, state, zip, sale_price, and closing_date — check page 1 of the Purchase Contract, the Settlement Statement / Closing Disclosure, and any property-description addenda. These are required. " +
          "For property_address return ONLY the street number and street name (do NOT include city/state/zip). " +
          "For closing_date use YYYY-MM-DD. For sale_price return a plain number with no symbols or commas. " +
          "For listing_agent_name and buyer_agent_name, ALWAYS check the FIRST PAGE of the closing package for fields labeled 'Seller's Agent:' and 'Buyer's Agent:' — these are typically typed or handwritten on lines and are the most reliable source. " +
          "For caliber_title_detected, scan every page (headers/footers especially) for the text 'Caliber Title' or the Caliber shield logo and set TRUE if present. Also populate title_company with whatever title company name you find. " +
          "ALSO populate checklist_detected by scanning every page across every PDF and marking each document type TRUE only when you can clearly identify a copy of that document (signed or unsigned). " +
          "If you can determine the year the home was built (from disclosures or settlement docs), set built_before_1978 = true when the year is before 1978; otherwise omit that field.",
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
        max_tokens: 4096,

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
