import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, BookOpen } from 'lucide-react';

interface BuyersGuideLead {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  buying_timeframe: string | null;
  mls_id: string | null;
  property_street: string | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BuyersGuideLeadsDialog({ open, onOpenChange }: Props) {
  const [leads, setLeads] = useState<BuyersGuideLead[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('buyers_guide_requests' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!error && data) setLeads(data as unknown as BuyersGuideLead[]);
      setLoading(false);
    })();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Buyers Guide Leads ({leads.length})
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">No buyers guide requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-muted-foreground">
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Name</th>
                  <th className="py-2 px-2">Email</th>
                  <th className="py-2 px-2">Phone</th>
                  <th className="py-2 px-2">Timeframe</th>
                  <th className="py-2 px-2">Property</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-border/50">
                    <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 px-2 font-medium">{l.name}</td>
                    <td className="py-2 px-2">
                      <a href={`mailto:${l.email}`} className="text-primary hover:underline">{l.email}</a>
                    </td>
                    <td className="py-2 px-2">
                      {l.phone && <a href={`tel:${l.phone}`} className="text-primary hover:underline">{l.phone}</a>}
                    </td>
                    <td className="py-2 px-2 text-xs">{l.buying_timeframe || '—'}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {l.property_street || '—'}
                      {l.mls_id && <span className="block text-[10px]">MLS# {l.mls_id}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
