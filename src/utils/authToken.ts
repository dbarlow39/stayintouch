import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the signed-in user's access token for direct edge-function fetch calls.
 * Edge functions verify this JWT server-side, so the anon key must not be used.
 */
export async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}
