import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, RefreshCw, Clock, ChevronRight, Loader2, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, formatRelativeTime } from '../lib/utils';

const INSIGHT_TYPES = [
  { type: 'PAY_EQUITY_SCORE', label: 'Pay Equity Score', description: 'Overall pay equity narrative with gender gap analysis', icon: '⚖️' },
  { type: 'ATTRITION_RISK', label: 'Attrition Risk', description: 'Identify employees at risk due to below-band compensation', icon: '⚠️' },
  { type: 'COMPA_RATIO_DISTRIBUTION', label: 'Compa-Ratio Distribution', description: 'Analysis of how salaries distribute across salary bands', icon: '📊' },
  { type: 'TOP_SALARIES', label: 'Top Compensation Review', description: 'Review of top 10 packages with performance alignment', icon: '🏆' },
  { type: 'NEW_HIRE_PARITY', label: 'New Hire Parity', description: 'Compare new hire vs existing employee pay parity', icon: '🤝' },
  { type: 'SALARY_GROWTH_TREND', label: 'Salary Growth Trend', description: 'YoY salary revision analysis across 4 cycles', icon: '📈' },
  { type: 'PROMOTION_READINESS', label: 'Promotion Readiness', description: 'Identify high-performers ready for promotion', icon: '🚀' },
] as const;

const insightApi = {
  getAll: async () => { const r = await api.get('/ai-insights'); return r.data; },
  getOrGenerate: async (type: string) => { const r = await api.get(`/ai-insights/${type}`); return r.data; },
  generate: async (insightType: string) => { const r = await api.post('/ai-insights/generate', { insightType }); return r.data; },
  invalidate: async (id: string) => { const r = await api.delete(`/ai-insights/${id}/invalidate`); return r.data; },
};

function InsightCard({
  insightType, label, description, icon,
  onView,
}: {
  insightType: string;
  label: string;
  description: string;
  icon: string;
  onView: (type: string) => void;
}) {
  const { data: existingRaw } = useQuery({
    queryKey: ['ai-insights', 'check', insightType],
    queryFn: () => insightApi.getAll().then((d: any) => {
      const all = d?.data || d || [];
      return all.find((i: any) => i.insightType === insightType) || null;
    }),
    staleTime: STALE_TIMES.MEDIUM,
  });

  const existing = existingRaw as any;
  const hasInsight = existing && !existing.error;

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-primary/40 transition-all">
      <div className="flex items-start gap-3">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {hasInsight && (
        <div className="px-3 py-2 rounded-lg bg-muted/30 text-xs text-muted-foreground">
          <p className="line-clamp-2">{existing.narrative?.slice(0, 120)}...</p>
          <p className="mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Generated {formatRelativeTime(existing.generatedAt)}
          </p>
        </div>
      )}

      <button
        onClick={() => onView(insightType)}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          hasInsight
            ? 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        )}
      >
        {hasInsight ? (
          <>View Insight <ChevronRight className="w-3.5 h-3.5" /></>
        ) : (
          <><Sparkles className="w-3.5 h-3.5" /> Generate</>
        )}
      </button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function AIInsightsPage() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: insightRaw, isLoading: insightLoading, refetch } = useQuery({
    queryKey: queryKeys.aiInsights.detail(selectedType || ''),
    queryFn: () => selectedType ? insightApi.getOrGenerate(selectedType) : Promise.resolve(null),
    enabled: !!selectedType,
    staleTime: STALE_TIMES.MEDIUM,
    retry: false,
  });

  const insight: any = (insightRaw as any)?.data ?? insightRaw;

  const handleView = async (type: string) => {
    // Remove any stale cached result for this type so getOrGenerate is always called fresh
    queryClient.removeQueries({ queryKey: queryKeys.aiInsights.detail(type) });
    setSelectedType(type);
    setGenerating(type);
  };

  const handleRegenerate = async () => {
    if (!insight?.id) return;
    await insightApi.invalidate(insight.id);
    queryClient.invalidateQueries({ queryKey: queryKeys.aiInsights.detail(selectedType || '') });
    refetch();
  };

  const isCurrentLoading = insightLoading && selectedType === generating;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Insights</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Claude-powered compensation intelligence narratives</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-200 bg-green-50 dark:bg-green-900/20 text-xs font-medium text-green-700 dark:text-green-400">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Claude claude-sonnet-4-6 Active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Card Grid */}
        <div className={cn('space-y-4', selectedType ? 'lg:col-span-1' : 'lg:col-span-3')}>
          {!selectedType && (
            <p className="text-sm text-muted-foreground">
              Select an insight type to generate an AI-powered analysis using live compensation data.
            </p>
          )}
          <div className={cn('grid gap-4', selectedType ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}>
            {INSIGHT_TYPES.map(it => (
              <InsightCard
                key={it.type}
                insightType={it.type}
                label={it.label}
                description={it.description}
                icon={it.icon}
                onView={handleView}
              />
            ))}
          </div>
        </div>

        {/* Right: Insight Detail */}
        {selectedType && (
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card h-full">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {INSIGHT_TYPES.find(it => it.type === selectedType)?.label}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {insight?.generatedAt && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(insight.generatedAt)}
                    </span>
                  )}
                  {insight?.narrative && <CopyButton text={insight.narrative} />}
                  <button
                    onClick={handleRegenerate}
                    disabled={isCurrentLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', isCurrentLoading && 'animate-spin')} />
                    Regenerate
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                {isCurrentLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full border-2 border-primary/30 animate-spin border-t-primary" />
                      <Sparkles className="w-5 h-5 text-primary absolute inset-0 m-auto" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Generating AI Analysis</p>
                      <p className="text-xs text-muted-foreground mt-1">Claude is analyzing your compensation data...</p>
                    </div>
                  </div>
                ) : insight?.narrative ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-4 mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-semibold text-foreground mt-4 mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-3 mb-1.5">{children}</h3>,
                        p: ({ children }) => <p className="text-sm text-foreground leading-relaxed mb-3">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-3">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-3">{children}</ol>,
                        li: ({ children }) => <li className="text-sm text-foreground">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-4 border-primary/40 pl-3 my-3 text-muted-foreground italic text-sm">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {insight.narrative}
                    </ReactMarkdown>

                    {insight.model && (
                      <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                        <span>Model: {insight.model}</span>
                        <span>{(insight.promptTokens || 0) + (insight.completionTokens || 0)} tokens used</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Click Generate in a card to create an AI insight</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
