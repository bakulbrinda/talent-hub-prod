import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, TrendingUp, AlertTriangle, Sparkles, RefreshCw, X, Loader2, Mail } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const performanceApi = {
  getMatrix: async () => { const r = await api.get('/performance/matrix'); return r.data; },
  getPromotionReadiness: async () => { const r = await api.get('/performance/promotion-readiness'); return r.data; },
  getPayAlignmentGaps: async () => { const r = await api.get('/performance/pay-alignment-gaps'); return r.data; },
  getAIAnalysis: async () => { const r = await api.get('/performance/ai-analysis'); return r.data; },
};

const BAND_COLORS: Record<string, string> = {
  A1: 'bg-slate-100 text-slate-700',
  A2: 'bg-blue-100 text-blue-700',
  P1: 'bg-indigo-100 text-indigo-700',
  P2: 'bg-violet-100 text-violet-700',
  P3: 'bg-purple-100 text-purple-700',
  M1: 'bg-amber-100 text-amber-700',
  M2: 'bg-orange-100 text-orange-700',
  D0: 'bg-rose-100 text-rose-700',
  D1: 'bg-red-100 text-red-700',
  D2: 'bg-pink-100 text-pink-700',
  P4: 'bg-fuchsia-100 text-fuchsia-700',
};

const QUADRANT_COLORS: Record<string, string> = {
  STAR: 'bg-blue-500',
  SOLID: 'bg-green-500',
  UNDER: 'bg-red-500',
  AVERAGE: 'bg-yellow-500',
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn('w-3 h-3', i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30')}
        />
      ))}
    </div>
  );
}

export default function PerformancePage() {
  const [activeTab, setActiveTab] = useState<'matrix' | 'promotion' | 'gaps'>('matrix');
  const [showAI, setShowAI] = useState(false);
  const [sendingAlert, setSendingAlert] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSendLowPerformerAlert = async () => {
    setSendingAlert(true);
    try {
      const r = await api.post('/email/low-performer-alert');
      const { sent, managerCount } = r.data.data;
      if (sent > 0) {
        toast.success(`Alerts sent to ${sent} manager(s)`, { description: `${managerCount} manager(s) notified about low performers` });
      } else {
        toast.info('No alerts sent', { description: 'SMTP not configured or no managers with low performers found' });
      }
    } catch {
      toast.error('Failed to send alerts');
    } finally {
      setSendingAlert(false);
    }
  };

  const { data: matrixRaw, isLoading: matrixLoading } = useQuery({
    queryKey: ['performance', 'matrix'],
    queryFn: performanceApi.getMatrix,
  });
  const { data: promotionRaw, isLoading: promotionLoading } = useQuery({
    queryKey: ['performance', 'promotion'],
    queryFn: performanceApi.getPromotionReadiness,
  });
  const { data: gapsRaw, isLoading: gapsLoading } = useQuery({
    queryKey: ['performance', 'gaps'],
    queryFn: performanceApi.getPayAlignmentGaps,
  });
  const { data: aiRaw, isLoading: aiLoading } = useQuery({
    queryKey: ['performance', 'ai-analysis'],
    queryFn: performanceApi.getAIAnalysis,
    enabled: showAI,
    staleTime: 30 * 60 * 1000,
  });
  const aiNarrative: string = aiRaw?.data?.narrative || '';

  const matrix = (matrixRaw?.data || []) as any[];
  const promotionList = (promotionRaw?.data || []) as any[];
  const gaps = (gapsRaw?.data || { stars: [], under: [], summary: { starCount: 0, underCount: 0 } }) as any;

  const quadrantCounts = matrix.reduce((acc: Record<string, number>, e: any) => {
    acc[e.quadrant] = (acc[e.quadrant] || 0) + 1;
    return acc;
  }, {});

  const tabs = [
    { key: 'matrix', label: 'Pay-Performance Matrix' },
    { key: 'promotion', label: 'Promotion Readiness' },
    { key: 'gaps', label: 'Pay Alignment Gaps' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Performance Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Analyze pay-performance alignment, promotion readiness, and compensation gaps
          </p>
        </div>
        <button
          onClick={() => setShowAI(v => !v)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0',
            showAI
              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
        >
          <Sparkles className="w-4 h-4" />
          {showAI ? 'Hide AI Analysis' : 'AI Analysis'}
        </button>
      </div>

      {/* AI Analysis Panel */}
      {showAI && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300">CompSense AI — Performance Analysis</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { queryClient.removeQueries({ queryKey: ['performance', 'ai-analysis'] }); queryClient.invalidateQueries({ queryKey: ['performance', 'ai-analysis'] }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
              <button onClick={() => setShowAI(false)} className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
              <span className="text-sm text-purple-700 dark:text-purple-300">Analyzing performance data with Claude AI…</span>
            </div>
          ) : aiNarrative ? (
            <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
              <ReactMarkdown>{aiNarrative}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click Regenerate to generate a fresh analysis.</p>
          )}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Stars (High Perf, Low Pay)', value: gaps.summary?.starCount || 0, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', icon: '⭐' },
          { label: 'Under (Low Perf, High Pay)', value: gaps.summary?.underCount || 0, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', icon: '⚠️' },
          { label: 'Promotion Ready', value: promotionList.length, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20', icon: '🚀' },
          { label: 'In Matrix', value: matrix.length, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20', icon: '📊' },
        ].map(kpi => (
          <div key={kpi.label} className={cn('rounded-xl border border-border p-4', kpi.bg)}>
            <div className="flex items-center gap-2 mb-2">
              <span>{kpi.icon}</span>
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pay-Performance Matrix */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {matrixLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Quadrant legend */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { key: 'STAR', label: 'Stars', desc: 'High perf + Low pay — Retention risk', color: 'border-blue-300 bg-blue-50 dark:bg-blue-900/20' },
                  { key: 'SOLID', label: 'Solid Performers', desc: 'High perf + Fair pay — Keep', color: 'border-green-300 bg-green-50 dark:bg-green-900/20' },
                  { key: 'UNDER', label: 'Under Performers', desc: 'Low perf + High pay — Action needed', color: 'border-red-300 bg-red-50 dark:bg-red-900/20' },
                  { key: 'AVERAGE', label: 'Average', desc: 'Middle performers', color: 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' },
                ].map(q => (
                  <div key={q.key} className={cn('rounded-lg border p-3', q.color)}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={cn('w-2.5 h-2.5 rounded-full', QUADRANT_COLORS[q.key])} />
                      <span className="text-xs font-semibold text-foreground">{q.label}</span>
                      <span className="ml-auto text-sm font-bold text-foreground">{quadrantCounts[q.key] || 0}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{q.desc}</p>
                  </div>
                ))}
              </div>

              {/* Matrix table */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {['Employee', 'Band', 'Department', 'Rating', 'Compa-Ratio', 'Annual CTC', 'Quadrant'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {matrix.map((e: any) => (
                      <tr
                        key={e.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/employees/${e.id}`)}
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                        <td className="px-4 py-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', BAND_COLORS[e.band] || 'bg-muted text-muted-foreground')}>
                            {e.band}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.department}</td>
                        <td className="px-4 py-3"><RatingStars rating={Math.round(e.rating)} /></td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'font-medium',
                            e.compaRatio >= 90 && e.compaRatio <= 110 ? 'text-green-600' : e.compaRatio < 80 ? 'text-red-600' : 'text-orange-600'
                          )}>
                            {e.compaRatio.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">₹{(e.annualCtc / 100000).toFixed(1)}L</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            e.quadrant === 'STAR' ? 'bg-blue-100 text-blue-700' :
                            e.quadrant === 'SOLID' ? 'bg-green-100 text-green-700' :
                            e.quadrant === 'UNDER' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          )}>
                            {e.quadrant}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {matrix.length === 0 && (
                  <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">No performance data available</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Promotion Readiness */}
      {activeTab === 'promotion' && (
        <div>
          {promotionLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {['Employee', 'Current Band', 'Next Band', 'Rating', 'Compa-Ratio', 'Tenure', 'Annual Fixed'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {promotionList.map((e: any) => (
                    <tr
                      key={e.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/employees/${e.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.department}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', BAND_COLORS[e.band] || 'bg-muted text-muted-foreground')}>
                          {e.band}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3 text-green-500" />
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', BAND_COLORS[e.nextBand] || 'bg-muted text-muted-foreground')}>
                            {e.nextBand}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3"><RatingStars rating={Math.round(e.rating)} /></td>
                      <td className="px-4 py-3">
                        <span className={cn('font-medium', e.compaRatio >= 90 ? 'text-green-600' : 'text-yellow-600')}>
                          {e.compaRatio.toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.tenureMonths}mo</td>
                      <td className="px-4 py-3 font-medium text-foreground">₹{(e.annualFixed / 100000).toFixed(1)}L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {promotionList.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">No employees currently ready for promotion</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pay Alignment Gaps */}
      {activeTab === 'gaps' && (
        <div className="space-y-6">
          {gapsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Stars section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-semibold text-foreground">Stars — High Performers, Below Market</h3>
                  <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs">{gaps.stars.length}</span>
                  <button
                    onClick={handleSendLowPerformerAlert}
                    disabled={sendingAlert}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {sendingAlert ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                    {sendingAlert ? 'Sending...' : 'Alert Managers'}
                  </button>
                </div>
                {gaps.stars.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2">No employees in this category</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {gaps.stars.map((e: any) => (
                      <div
                        key={e.id}
                        className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                        onClick={() => navigate(`/employees/${e.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.department} · {e.band}</p>
                          </div>
                          <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                            Retention Risk
                          </span>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>Rating: <strong className="text-foreground">{e.rating}</strong></span>
                          <span>Compa-Ratio: <strong className="text-red-600">{e.compaRatio.toFixed(0)}%</strong></span>
                          <span>CTC: <strong className="text-foreground">₹{(e.annualFixed / 100000).toFixed(1)}L</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Under section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  <h3 className="text-sm font-semibold text-foreground">Under — Low Performers, Above Market</h3>
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">{gaps.under.length}</span>
                </div>
                {gaps.under.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-2">No employees in this category</p>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {gaps.under.map((e: any) => (
                      <div
                        key={e.id}
                        className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        onClick={() => navigate(`/employees/${e.id}`)}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{e.name}</p>
                            <p className="text-xs text-muted-foreground">{e.department} · {e.band}</p>
                          </div>
                          <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            Action Needed
                          </span>
                        </div>
                        <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                          <span>Rating: <strong className="text-foreground">{e.rating}</strong></span>
                          <span>Compa-Ratio: <strong className="text-orange-600">{e.compaRatio.toFixed(0)}%</strong></span>
                          <span>CTC: <strong className="text-foreground">₹{(e.annualFixed / 100000).toFixed(1)}L</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
