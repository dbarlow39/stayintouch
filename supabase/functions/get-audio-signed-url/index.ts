import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireUser, corsHeaders } from "../_shared/verifyAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { path } = await req.json();
  if (!path || typeof path !== "string") {
    return new Response(JSON.stringify({ error: "path required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Enforce ownership: audio-recordings paths are stored as `<userId>/...`.
  const firstSegment = path.split("/")[0];
  if (firstSegment !== auth.userId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await supabase.storage
    .from("audio-recordings")
    .createSignedUrl(path, 3600);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
