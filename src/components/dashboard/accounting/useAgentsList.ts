import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const useAgentsList = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["accounting-agents-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
};
