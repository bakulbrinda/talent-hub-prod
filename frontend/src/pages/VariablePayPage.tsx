import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Target, BarChart3, TrendingUp, Sparkles, RefreshCw, X, Loader2, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const vpApi = {
  getPlans: async () => { const r = await api.get('/variable-pay/plans'); return r.data; },
  getAchievements: async (filters?: any) => {
    const params = new URLSearchParams(filters || {});
    const r = await api.get(`/variable-pay/achievements?${params}`);
    return r.data;
  },
  calculatePayout: async (data: any) => { const r = await api.post('/variable-pay/calculate', data); return r.data; },
  saveAchievement: async (data: any) => { const r = await api.post('/variable-pay/achievements', data); return r.data; },
  getAnalytics: async () => { const r = await api.get('/variable-pay/analytics'); return r.data; },
  getAIAnalysis: async () => { const r = await api.get('/variable-pay/ai-analysis'); return r.data; },
};

// Generate the last 6 quarters as period options
function getRecentQuarters(): string[] {
  const quarters = [];
  const now = new Date();
  let year = now.getFullYear();
  let q = Math.ceil((now.getMonth() + 1) / 3);
  for (let i = 0; i < 6; i++) {
    quarters.push(`${year}-Q${q}`);
    q--;
    if (q === 0) { q = 4; year--; }
  }
  return quarters;
}

const PLAN_TYPE_COLORS: Record<string, string> = {
  SALES: 'bg-blue-100 text-blue-700',
  PERFORMANCE: 'bg-green-100 text-green-700',
  HYBRID: 'bg-purple-100 text-purple-700',
};

export default function VariablePayPage() {
  const [activeTab, setActiveTab] = useState<'plans' | 'achievements' | 'calculator' | 'analytics'>('plans');
  const [calcForm, setCalcForm] = useState({ employeeId: '', planId: '', achievedAmount: '', period: getRecentQuarters()[0] });
  const [calcResult, setCalcResult] = useState<any>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [savedPeriod, setSavedPeriod] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);
  const queryClient = useQueryClient();

  const { data: plansRaw } = useQuery({ queryKey: ['variable-pay', 'plans'], queryFn: vpApi.getPlans });
  const { data: achievementsRaw } = useQuery({ queryKey: ['variable-pay', 'achievements'], queryFn: () => vpApi.getAchievements() });
  const { data: employeesRaw } = useQuery({
    queryKey: ['employees-vp-calc'],
    queryFn: async () => { const r = await api.get('/employees?limit=500'); return r.data; },
    staleTime: 5 * 60 * 1000,
  });
  const { data: analyticsRaw } = useQuery({ queryKey: ['variable-pay', 'analytics'], queryFn: vpApi.getAnalytics });
  const { data: aiRaw, isLoading: aiLoading } = useQuery({
    queryKey: ['variable-pay', 'ai-analysis'],
    queryFn: vpApi.getAIAnalysis,
    enabled: showAI,
    staleTime: 30 * 60 * 1000,
  });
  const aiNarrative: string = aiRaw?.data?.narrative || '';

  const plans = (plansRaw?.data || []) as any[];
  const achievements = (achievementsRaw?.data || []) as any[];
  const analytics = (analyticsRaw?.data || {}) as any;
  const employees: any[] = (employeesRaw as any)?.data ?? (Array.isArray(employeesRaw) ? employeesRaw : []);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalcLoading(true);
    setCalcResult(null);
    setSavedPeriod(null);
    try {
      const result = await vpApi.calculatePayout({
        employeeId: calcForm.employeeId,
        planId: calcForm.planId,
        achievedAmount: Number(calcForm.achievedAmount),
      });
      setCalcResult(result.data);
    } catch (err) {
      console.error(err);
    } finally {
      setCalcLoading(false);
    }
  };

  const handleSaveAchievement = async () => {
    if (!calcResult) return;
    setSaveLoading(true);
    try {
      await vpApi.saveAchievement({
        employeeId: calcForm.employeeId,
        planId: calcForm.planId,
        period: calcForm.period,
        targetAmount: calcResult.targetAmount,
        achievedAmount: calcResult.achievedAmount,
        achievementPercent: calcResult.achievementPercent,
        payoutAmount: calcResult.payoutAmount,
      });
      setSavedPeriod(calcForm.period);
      queryClient.invalidateQueries({ queryKey: ['variable-pay', 'achievements'] });
      queryClient.invalidateQueries({ queryKey: ['variable-pay', 'analytics'] });
      toast.success(`Achievement saved for ${calcResult.employeeName} — ${calcForm.period}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaveLoading(false);
    }
  };

  const tabs = [
    { key: 'plans', label: 'Commission Plans', icon: Target },
    { key: 'achievements', label: 'Achievement Tracking', icon: TrendingUp },
    { key: 'calculator', label: 'Payout Calculator', icon: Calculator },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Variable Pay</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Commission plans, achievement tracking, and payout calculations</p>
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
              <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300">CompSense AI — Variable Pay Analysis</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { queryClient.removeQueries({ queryKey: ['variable-pay', 'ai-analysis'] }); queryClient.invalidateQueries({ queryKey: ['variable-pay', 'ai-analysis'] }); }}
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
              <span className="text-sm text-purple-700 dark:text-purple-300">Analyzing variable pay data with Claude AI…</span>
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

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Commission Plans', value: plans.length, icon: '📋', color: 'text-blue-600' },
          { label: 'Avg Achievement', value: `${analytics.avgAchievementPercent || 0}%`, icon: '🎯', color: analytics.avgAchievementPercent >= 100 ? 'text-green-600' : 'text-yellow-600' },
          { label: 'Total Payouts', value: `₹${((analytics.totalPayoutAmount || 0) / 100000).toFixed(0)}L`, icon: '💰', color: 'text-purple-600' },
          { label: 'Total Achievements', value: analytics.totalAchievements || 0, icon: '📊', color: 'text-orange-600' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">{kpi.icon}</span>
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Commission Plans Tab */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {plans.length === 0 ? (
            <div className="col-span-2 rounded-xl border border-border bg-card py-12 text-center">
              <p className="text-sm text-muted-foreground">No commission plans configured</p>
            </div>
          ) : (
            plans.map((plan: any) => {
              const tiers = (plan.acceleratorTiers || []) as any[];
              return (
                <div key={plan.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
                      <span className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium', PLAN_TYPE_COLORS[plan.planType] || 'bg-muted text-muted-foreground')}>
                        {plan.planType}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{plan.targetVariablePercent}%</p>
                      <p className="text-xs text-muted-foreground">of annual fixed</p>
                    </div>
                  </div>

                  {/* Tier visualization */}
                  {tiers.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Accelerator Tiers</p>
                      <div className="space-y-1.5">
                        {tiers.map((tier: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-16 text-xs text-muted-foreground text-right">≥{tier.threshold}%</div>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.min(100, (tier.multiplier / 2) * 100)}%` }}
                              />
                            </div>
                            <div className="w-12 text-xs font-medium text-foreground text-right">{tier.multiplier}x</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Achievement Tracking */}
      {activeTab === 'achievements' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {['Employee', 'Plan', 'Period', 'Target', 'Achieved', 'Achievement %', 'Payout'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {achievements.map((a: any) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{a.employee.firstName} {a.employee.lastName}</p>
                    <p className="text-xs text-muted-foreground">{a.employee.department} · {a.employee.band}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{a.plan.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.period}</td>
                  <td className="px-4 py-3 text-foreground">₹{(a.targetAmount / 1000).toFixed(0)}K</td>
                  <td className="px-4 py-3 text-foreground">₹{(a.achievedAmount / 1000).toFixed(0)}K</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-medium', a.achievementPercent >= 100 ? 'text-green-600' : a.achievementPercent >= 80 ? 'text-yellow-600' : 'text-red-600')}>
                      {a.achievementPercent.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">₹{(a.payoutAmount / 1000).toFixed(0)}K</td>
                </tr>
              ))}
            </tbody>
          </table>
          {achievements.length === 0 && (
            <div className="py-12 text-center"><p className="text-sm text-muted-foreground">No achievements recorded</p></div>
          )}
        </div>
      )}

      {/* Payout Calculator */}
      {activeTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Calculate Payout</h3>
            <form onSubmit={handleCalculate} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Employee ID</label>
                <input
                  type="text"
                  placeholder="Enter employee ID"
                  value={calcForm.employeeId}
                  onChange={e => setCalcForm(p => ({ ...p, employeeId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Commission Plan</label>
                <select
                  value={calcForm.planId}
                  onChange={e => setCalcForm(p => ({ ...p, planId: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select a plan</option>
                  {plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Achieved Amount (₹)</label>
                <input
                  type="number"
                  placeholder="Enter achieved amount"
                  value={calcForm.achievedAmount}
                  onChange={e => setCalcForm(p => ({ ...p, achievedAmount: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={calcLoading || !calcForm.employeeId || !calcForm.planId || !calcForm.achievedAmount}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {calcLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Calculator className="w-4 h-4" />}
                Calculate Payout
              </button>
            </form>
          </div>

          {calcResult && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Calculation Result</h3>
              <p className="text-xs text-muted-foreground">{calcResult.employeeName}</p>
              <div className="space-y-3">
                {[
                  { label: 'Quarterly Target', value: `₹${(calcResult.targetAmount / 1000).toFixed(0)}K` },
                  { label: 'Achieved Amount', value: `₹${(calcResult.achievedAmount / 1000).toFixed(0)}K` },
                  { label: 'Achievement %', value: `${calcResult.achievementPercent}%` },
                  { label: 'Multiplier Applied', value: `${calcResult.multiplier}x` },
                ].map(item => (
                  <div key={item.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-medium text-foreground">{item.value}</span>
                  </div>
                ))}
                <div className="pt-3 border-t border-border flex justify-between">
                  <span className="text-sm font-semibold text-foreground">Payout Amount</span>
                  <span className="text-lg font-bold text-green-600">₹{(calcResult.payoutAmount / 1000).toFixed(0)}K</span>
                </div>
              </div>
              {calcResult.appliedTier && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <p className="text-xs text-primary font-medium">Tier Applied: ≥{calcResult.appliedTier.threshold}% → {calcResult.appliedTier.multiplier}x multiplier</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Analytics */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Distribution */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Achievement Distribution</h3>
              <div className="space-y-3">
                {(analytics.distribution || []).map((d: any) => {
                  const maxCount = Math.max(...(analytics.distribution || []).map((x: any) => x.count), 1);
                  return (
                    <div key={d.label} className="flex items-center gap-3">
                      <span className="w-16 text-xs text-muted-foreground text-right">{d.label}</span>
                      <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-md flex items-center justify-end pr-2"
                          style={{ width: `${(d.count / maxCount) * 100}%` }}
                        >
                          {d.count > 0 && <span className="text-xs font-medium text-primary-foreground">{d.count}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Band */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Avg Achievement by Band</h3>
              <div className="space-y-3">
                {(analytics.byBand || []).sort((a: any, b: any) => b.avgAchievement - a.avgAchievement).map((b: any) => (
                  <div key={b.band} className="flex items-center gap-3">
                    <span className="w-8 text-xs font-medium text-foreground">{b.band}</span>
                    <div className="flex-1 h-6 bg-muted rounded-md overflow-hidden">
                      <div
                        className={cn('h-full rounded-md flex items-center justify-end pr-2', b.avgAchievement >= 100 ? 'bg-green-500' : b.avgAchievement >= 80 ? 'bg-yellow-500' : 'bg-red-500')}
                        style={{ width: `${Math.min(100, b.avgAchievement)}%` }}
                      >
                        <span className="text-xs font-medium text-white">{b.avgAchievement}%</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(analytics.byBand || []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
