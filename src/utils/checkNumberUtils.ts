import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches the next check number by incrementing the counter in the database.
 * Returns the new check number as a string.
 */
export const getNextCheckNumber = async (): Promise<string> => {
  // Read current value
  const { data, error: readError } = await supabase
    .from("check_number_counter")
    .select("last_check_number")
    .eq("id", "default")
    .single();

  if (readError) throw readError;

  const next = (data?.last_check_number ?? 0) + 1;

  // Update the counter
  const { error: updateError } = await supabase
    .from("check_number_counter")
    .update({ last_check_number: next, updated_at: new Date().toISOString() })
    .eq("id", "default");

  if (updateError) throw updateError;

  return String(next);
};

/**
 * Peeks at the next check number without incrementing.
 */
export const peekNextCheckNumber = async (): Promise<string> => {
  const { data, error } = await supabase
    .from("check_number_counter")
    .select("last_check_number")
    .eq("id", "default")
    .single();

  if (error) throw error;
  return String((data?.last_check_number ?? 0) + 1);
};

/**
 * Sets the counter to a specific check number (if >= current).
 * Use when a user manually enters a check number.
 */
export const setCheckNumber = async (checkNumber: number): Promise<void> => {
  const { data, error: readError } = await supabase
    .from("check_number_counter")
    .select("last_check_number")
    .eq("id", "default")
    .single();

  if (readError) throw readError;

  const { error: updateError } = await supabase
    .from("check_number_counter")
    .update({ last_check_number: checkNumber, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (updateError) throw updateError;
};
