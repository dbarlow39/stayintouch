import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import ClientDetailModal from "@/components/dashboard/ClientDetailModal";

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  const { data: client, isLoading, error } = useQuery({
    queryKey: ["client-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id && !!user,
  });

  const handleClose = () => {
    navigate("/dashboard?tab=clients");
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading client...
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Client not found.</p>
        <button
          onClick={handleClose}
          className="text-primary hover:underline"
        >
          Back to Clients
        </button>
      </div>
    );
  }

  return (
    <ClientDetailModal
      client={client as any}
      open={true}
      onClose={handleClose}
      onClientUpdated={() => {
        // refetch happens via query invalidation inside the modal
      }}
    />
  );
};

export default ClientDetail;
