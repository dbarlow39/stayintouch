import { supabase } from "@/integrations/supabase/client";

/**
 * Counter utilities for the Return Deposit business account check series.
 * This is a SEPARATE counter from the main check_number_counter (commission/vendor checks)
 * because return-deposit checks are written from a different bank account.
 */

const COUNTER_TABLE = "deposit_return_check_counter" as const;

export const peekNextDepositReturnCheckNumber = async (): Promise<string> => {
  const { data, error } = await supabase
    .from(COUNTER_TABLE)
    .select("last_check_number")
    .eq("id", "default")
    .single();
  if (error) throw error;
  return String((data?.last_check_number ?? 1310) + 1);
};

export const getNextDepositReturnCheckNumber = async (): Promise<string> => {
  const { data, error: readError } = await supabase
    .from(COUNTER_TABLE)
    .select("last_check_number")
    .eq("id", "default")
    .single();
  if (readError) throw readError;

  const next = (data?.last_check_number ?? 1310) + 1;

  const { error: updateError } = await supabase
    .from(COUNTER_TABLE)
    .update({ last_check_number: next, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (updateError) throw updateError;

  return String(next);
};

export const setDepositReturnCheckNumber = async (checkNumber: number): Promise<void> => {
  const { error } = await supabase
    .from(COUNTER_TABLE)
    .update({ last_check_number: checkNumber, updated_at: new Date().toISOString() })
    .eq("id", "default");
  if (error) throw error;
};
