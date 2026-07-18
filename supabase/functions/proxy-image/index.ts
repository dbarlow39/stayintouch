import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireUser, corsHeaders } from "../_shared/verifyAuth.ts";

// Allowlisted image hosts (MLS/photo CDNs and Supabase storage).
const ALLOWED_HOST_SUFFIXES = [
  "sparkapi.com",
  "sparkplatform.com",
  "mlsgrid.com",
  "cloudfront.net",
  "amazonaws.com",
  "supabase.co",
  "supabase.in",
  "flexmls.com",
];

function isPrivateHost(hostname: string): boolean {
  // Block localhost, link-local, RFC1918, and cloud metadata endpoints.
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;
  if (h === "169.254.169.254" || h === "metadata.google.internal") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function isAllowedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (isPrivateHost(u.hostname)) return false;
    return ALLOWED_HOST_SUFFIXES.some((suffix) =>
      u.hostname === suffix || u.hostname.endsWith("." + suffix)
    );
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isAllowedUrl(url)) {
      return new Response(JSON.stringify({ error: "URL host not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let imgResp: Response;
    try {
      imgResp = await fetch(url, { signal: controller.signal, redirect: "follow" });
    } finally {
      clearTimeout(timeout);
    }
    if (!imgResp.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch image: ${imgResp.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = imgResp.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response(JSON.stringify({ error: "Response is not an image" }), {
        status: 415,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const arrayBuffer = await imgResp.arrayBuffer();
    if (arrayBuffer.byteLength > 15 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const b64 = base64Encode(new Uint8Array(arrayBuffer));

    return new Response(JSON.stringify({ data: `data:${contentType};base64,${b64}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("proxy-image error:", e);
    return new Response(JSON.stringify({ error: "Proxy failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
