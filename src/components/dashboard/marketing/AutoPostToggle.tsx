import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Facebook, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const AutoPostToggle = () => {
  const queryClient = useQueryClient();

  const { data: isAdmin } = useQuery({
    queryKey: ['user-is-admin-marketing'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const { data } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      return !!data;
    },
  });

  const { data: autoPostEnabled, isLoading } = useQuery({
    queryKey: ['auto-post-facebook-setting'],
    queryFn: async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('auto_post_facebook')
        .eq('id', 'default')
        .single();
      return (data as any)?.auto_post_facebook ?? false;
    },
    enabled: !!isAdmin,
  });

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ auto_post_facebook: enabled } as any)
        .eq('id', 'default');
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['auto-post-facebook-setting'] });
      toast.success(enabled ? 'Auto-post to Facebook enabled' : 'Auto-post to Facebook disabled');
    },
    onError: (err: any) => {
      toast.error('Failed to update setting: ' + (err.message || 'Unknown error'));
    },
  });

  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2.5">
      <Facebook className="w-4 h-4 text-blue-600 shrink-0" />
      <Label htmlFor="auto-post-toggle" className="text-sm font-medium text-card-foreground cursor-pointer flex-1">
        Auto-Post to Facebook
      </Label>
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          id="auto-post-toggle"
          checked={autoPostEnabled ?? false}
          onCheckedChange={(checked) => mutation.mutate(checked)}
          disabled={mutation.isPending}
        />
      )}
      <span className="text-[10px] text-muted-foreground hidden sm:block max-w-[180px]">
        New listings, price changes & back-on-market
      </span>
    </div>
  );
};

export default AutoPostToggle;
