import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, Loader2, Users, TrendingUp, DollarSign, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

interface SuggestedScenario {
  id: string;
  name: string;
  description: string;
  estimatedCostLakhs: number;
  costPercent: number;
  affectedCount: number;
  rationale: string;
  status: string;
}

const EXAMPLE_GOALS = [
  'Retain top-performing engineers within 8% budget increase',
  'Close gender pay gap in Engineering department',
  'Bring all below-band employees to at least band minimum',
  'Give 10% raise to employees with performance rating ≥ 4',
];

export function ScenarioSuggester({ onCreated }: { onCreated?: () => void }) {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedScenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleSuggest = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setSuggestions([]);
    setError(null);

    try {
      const res = await api.post('/ai/chat/suggest-scenarios', { goal });
      setSuggestions(res.data.data || []);
      // Refresh scenarios list so new DRAFTs appear immediately
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      onCreated?.();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to generate suggestions');
      toast.error('Could not generate scenarios');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">AI Scenario Suggester</h3>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Beta</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Describe your compensation goal and Claude will create 3 ready-to-run scenarios based on your live org data.
      </p>

      {/* Goal input */}
      <div className="space-y-2">
        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSuggest(); } }}
          placeholder='e.g. "Retain top engineers within 8% budget increase"'
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_GOALS.map((eg, i) => (
              <button
                key={i}
                onClick={() => setGoal(eg)}
                className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                {eg.split(' ').slice(0, 4).join(' ')}…
              </button>
            ))}
          </div>
          <button
            onClick={handleSuggest}
            disabled={loading || !goal.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> Ask AI</>
            )}
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span>Claude is analyzing your org data and building scenarios…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Suggested scenarios */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">
            {suggestions.length} scenarios created as DRAFT — select one below to run or apply:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {suggestions.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  'rounded-xl border-2 p-4 space-y-3 transition-all',
                  i === 0 ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
                )}
              >
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn('w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0',
                      i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}>
                      {i + 1}
                    </span>
                    <p className="text-sm font-semibold text-foreground leading-tight">{s.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{s.description}</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-muted/50">
                    <Users className="w-3 h-3 text-muted-foreground mb-0.5" />
                    <span className="font-semibold text-foreground">{s.affectedCount}</span>
                    <span className="text-muted-foreground text-[10px]">people</span>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-muted/50">
                    <DollarSign className="w-3 h-3 text-muted-foreground mb-0.5" />
                    <span className="font-semibold text-foreground">₹{s.estimatedCostLakhs.toFixed(0)}L</span>
                    <span className="text-muted-foreground text-[10px]">add. cost</span>
                  </div>
                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-muted/50">
                    <TrendingUp className="w-3 h-3 text-muted-foreground mb-0.5" />
                    <span className="font-semibold text-foreground">{s.costPercent.toFixed(1)}%</span>
                    <span className="text-muted-foreground text-[10px]">of payroll</span>
                  </div>
                </div>

                {/* Rationale */}
                {s.rationale && (
                  <p className="text-[11px] text-muted-foreground italic leading-relaxed border-t border-border pt-2">
                    {s.rationale}
                  </p>
                )}

                {/* View in modeler */}
                <div className="pt-1 border-t border-border">
                  <p className="text-[11px] text-primary flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" />
                    Saved as DRAFT — select it in the list above to run
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
