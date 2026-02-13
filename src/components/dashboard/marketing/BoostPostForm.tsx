import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loader2, Rocket, DollarSign, MapPin, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const budgetOptions = [
  { value: '5', label: '$5/day' },
  { value: '10', label: '$10/day' },
  { value: '25', label: '$25/day' },
  { value: '50', label: '$50/day' },
  { value: '100', label: '$100/day' },
];

const durationOptions = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

interface BoostPostFormProps {
  postId: string;
  agentId: string;
  city?: string;
  state?: string;
}

const BoostPostForm = ({ postId, agentId, city, state }: BoostPostFormProps) => {
  const [dailyBudget, setDailyBudget] = useState('10');
  const [duration, setDuration] = useState('7');
  const [targetCity, setTargetCity] = useState(city || '');
  const [targetState, setTargetState] = useState(state || '');
  const [boosting, setBoosting] = useState(false);
  const [boosted, setBoosted] = useState(false);

  const totalBudget = Number(dailyBudget) * Number(duration);

  const handleBoost = async () => {
    setBoosting(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/boost-facebook-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ANON_KEY}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          post_id: postId,
          daily_budget: Number(dailyBudget),
          duration_days: Number(duration),
          city: targetCity || undefined,
          state: targetState || undefined,
        }),
      });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setBoosted(true);
      toast.success(`Boost launched! $${totalBudget} over ${duration} days 🚀`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to boost post');
    }
    setBoosting(false);
  };

  if (boosted) {
    return (
      <div className="border border-emerald-500/30 bg-emerald-500/10 rounded-lg p-4 mt-2">
        <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          Boost active! ${dailyBudget}/day for {duration} days (${totalBudget} total)
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Targeting: {targetCity ? `${targetCity}, ${targetState}` : targetState || 'United States'} • Housing category applied
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 mt-2 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-card-foreground">
        <Rocket className="w-4 h-4 text-primary" />
        Boost This Post
      </div>

      <p className="text-xs text-muted-foreground">
        Fair Housing compliant — no age, gender, or zip targeting.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            <DollarSign className="w-3 h-3 inline mr-1" />Daily Budget
          </label>
          <Select value={dailyBudget} onValueChange={setDailyBudget}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {budgetOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            <Calendar className="w-3 h-3 inline mr-1" />Duration
          </label>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {durationOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          <MapPin className="w-3 h-3 inline mr-1" />Target Location (25mi radius)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={targetCity}
            onChange={e => setTargetCity(e.target.value)}
            placeholder="City"
            className="text-sm"
          />
          <Input
            value={targetState}
            onChange={e => setTargetState(e.target.value)}
            placeholder="State (e.g. OH)"
            className="text-sm"
            maxLength={2}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-sm font-semibold text-foreground">
          Total: ${totalBudget}
        </p>
        <Button
          onClick={handleBoost}
          disabled={boosting}
          size="sm"
          className="!bg-green-600 hover:!bg-green-700 !text-white"
        >
          {boosting ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Boosting...</>
          ) : (
            <><Rocket className="w-4 h-4 mr-2" /> Launch Boost</>
          )}
        </Button>
      </div>
    </div>
  );
};

export default BoostPostForm;
