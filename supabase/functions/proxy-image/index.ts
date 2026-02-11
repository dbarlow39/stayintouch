import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      throw new Error("url is required");
    }

    const imgResp = await fetch(url);
    if (!imgResp.ok) {
      throw new Error(`Failed to fetch image: ${imgResp.status}`);
    }

    const contentType = imgResp.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await imgResp.arrayBuffer();
    const b64 = base64Encode(new Uint8Array(arrayBuffer));

    return new Response(JSON.stringify({ data: `data:${contentType};base64,${b64}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("proxy-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
