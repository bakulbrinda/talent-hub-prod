import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Scale, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, formatINR, getBandColor } from '../lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'gender-gap', label: 'Gender Gap' },
  { id: 'heatmap', label: 'Compa-Ratio Heatmap' },
  { id: 'distribution', label: 'Distribution' },
  { id: 'outliers', label: 'Outliers' },
] as const;
type TabId = typeof TABS[number]['id'];

const payEquityApi = {
  getScore: async () => { const r = await api.get('/pay-equity/score'); return r.data; },
  getGenderGap: async (filters?: any) => {
    const params = new URLSearchParams(filters || {});
    const r = await api.get(`/pay-equity/gender-gap?${params}`);
    return r.data;
  },
  getHeatmap: async () => { const r = await api.get('/pay-equity/heatmap'); return r.data; },
  getDistribution: async () => { const r = await api.get('/pay-equity/compa-ratio-distribution'); return r.data; },
  getOutliers: async () => { const r = await api.get('/pay-equity/outliers'); return r.data; },
};

const BANDS = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
const DEPARTMENTS = ['Engineering', 'Sales', 'Product', 'HR', 'Finance', 'Operations'];

function heatmapColor(cr: number): string {
  if (cr < 70) return '#ef4444';
  if (cr < 80) return '#f97316';
  if (cr < 90) return '#eab308';
  if (cr <= 110) return '#22c55e';
  if (cr <= 120) return '#f59e0b';
  return '#f97316';
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Needs Attention' : 'Critical';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={color} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 251.2} 251.2`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-3xl font-bold" style={{ color }}>{score}</p>
          </div>
        </div>
      </div>
      <p className="text-sm font-semibold mt-1" style={{ color }}>{label}</p>
      <p className="text-xs text-muted-foreground">out of 100</p>
    </div>
  );
}

export default function PayEquityPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [filters, setFilters] = useState<{ department?: string; band?: string }>({});

  const { data: scoreRaw } = useQuery({
    queryKey: queryKeys.payEquity.score,
    queryFn: payEquityApi.getScore,
    staleTime: STALE_TIMES.MEDIUM,
  });

  const { data: gapRaw } = useQuery({
    queryKey: queryKeys.payEquity.genderGap(filters),
    queryFn: () => payEquityApi.getGenderGap(filters),
    staleTime: STALE_TIMES.MEDIUM,
  });

  const { data: heatmapRaw } = useQuery({
    queryKey: queryKeys.payEquity.heatmap,
    queryFn: payEquityApi.getHeatmap,
    staleTime: STALE_TIMES.MEDIUM,
  });

  const { data: distRaw } = useQuery({
    queryKey: queryKeys.payEquity.distribution(),
    queryFn: payEquityApi.getDistribution,
    staleTime: STALE_TIMES.MEDIUM,
  });

  const { data: outliersRaw } = useQuery({
    queryKey: queryKeys.payEquity.outliers,
    queryFn: payEquityApi.getOutliers,
    staleTime: STALE_TIMES.MEDIUM,
  });

  const score: any = (scoreRaw as any)?.data ?? scoreRaw;
  const gap: any = (gapRaw as any)?.data ?? gapRaw;
  const heatmap: any[] = (heatmapRaw as any)?.data ?? (Array.isArray(heatmapRaw) ? heatmapRaw : []);
  const dist: any[] = (distRaw as any)?.data ?? (Array.isArray(distRaw) ? distRaw : []);
  const outliers: any[] = (outliersRaw as any)?.data ?? (Array.isArray(outliersRaw) ? outliersRaw : []);

  // Build heatmap grid
  const heatmapMap = new Map<string, { avgCompaRatio: number; count: number }>();
  for (const row of heatmap) {
    heatmapMap.set(`${row.department}:${row.band}`, { avgCompaRatio: row.avgCompaRatio, count: row.count });
  }

  const gapColor = (pct: number) =>
    Math.abs(pct) < 5 ? 'text-green-600 dark:text-green-400' :
    Math.abs(pct) < 10 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pay Equity Analysis</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Detect and analyze compensation disparities across gender, band, and department</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: 'Pay Equity Score',
            value: score ? `${score.score}/100` : '—',
            icon: Scale,
            color: score?.score >= 80 ? 'text-green-600' : score?.score >= 60 ? 'text-amber-600' : 'text-red-600',
          },
          {
            label: 'Gender Pay Gap',
            value: gap?.overall ? `${Math.abs(gap.overall.gapPercent).toFixed(1)}%` : '—',
            icon: gap?.overall?.gapPercent > 0 ? TrendingDown : TrendingUp,
            color: gap?.overall ? gapColor(gap.overall.gapPercent) : '',
          },
          {
            label: 'Outside Bands',
            value: outliers.length || score?.outlierCount || '—',
            icon: AlertTriangle,
            color: (outliers.length || score?.outlierCount || 0) > 0 ? 'text-red-600' : 'text-green-600',
          },
          {
            label: 'In-Range Employees',
            value: score ? `${score.components?.compaScore ?? '—'}%` : '—',
            icon: CheckCircle2,
            color: 'text-green-600',
          },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className={cn('text-xl font-bold mt-1', kpi.color)}>{kpi.value}</p>
              </div>
              <kpi.icon className={cn('w-5 h-5 flex-shrink-0', kpi.color)} />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.id === 'outliers' && outliers.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                  {outliers.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && score && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-foreground mb-4 self-start">Pay Equity Score</h3>
            <ScoreGauge score={score.score} />
            {score.components && (
              <div className="mt-4 w-full space-y-2 text-sm">
                {[
                  { label: 'Gender Gap Score', value: score.components.genderScore },
                  { label: 'Compa-Ratio Score', value: score.components.compaScore },
                  { label: 'Outlier Score', value: score.components.outlierScore },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="text-muted-foreground flex-1 text-xs">{item.label}</span>
                    <div className="w-24 h-1.5 bg-muted rounded-full">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${item.value}%` }} />
                    </div>
                    <span className="text-xs font-medium w-8 text-right">{item.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {gap?.overall && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-semibold text-foreground mb-4">Overall Gender Pay Gap</h3>
              <div className="space-y-4">
                <div className={cn('text-4xl font-bold', gapColor(gap.overall.gapPercent))}>
                  {Math.abs(gap.overall.gapPercent).toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground">
                  Male employees earn {Math.abs(gap.overall.gapPercent).toFixed(1)}% more than female employees on average
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-xs text-muted-foreground mb-1">Male Average</p>
                    <p className="font-semibold text-foreground">{formatINR(gap.overall.maleAvg)}</p>
                    <p className="text-xs text-muted-foreground">{gap.overall.maleCount} employees</p>
                  </div>
                  <div className="p-3 rounded-lg bg-pink-50 dark:bg-pink-900/20">
                    <p className="text-xs text-muted-foreground mb-1">Female Average</p>
                    <p className="font-semibold text-foreground">{formatINR(gap.overall.femaleAvg)}</p>
                    <p className="text-xs text-muted-foreground">{gap.overall.femaleCount} employees</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    Gap Amount: {formatINR(Math.abs(gap.overall.gapAmount))} per year
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gender Gap Tab */}
      {activeTab === 'gender-gap' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <select
              value={filters.department || ''}
              onChange={e => setFilters(f => ({ ...f, department: e.target.value || undefined }))}
              className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none"
            >
              <option value="">All Departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <select
              value={filters.band || ''}
              onChange={e => setFilters(f => ({ ...f, band: e.target.value || undefined }))}
              className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none"
            >
              <option value="">All Bands</option>
              {BANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {!gap?.byDepartment ? (
            <div className="h-64 bg-muted/30 rounded-xl animate-pulse" />
          ) : gap?.byDepartment ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Gender Pay Gap by Department</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={gap.byDepartment.slice(0, 8)}
                  margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="department" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `₹${(v/100000).toFixed(0)}L`} tick={{ fontSize: 11 }} width={55} />
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Legend />
                  <Bar dataKey="maleAvg" name="Male Avg" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="femaleAvg" name="Female Avg" fill="#ec4899" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs font-medium">
                      <th className="text-left pb-2">Department</th>
                      <th className="text-right pb-2">Male Avg</th>
                      <th className="text-right pb-2">Female Avg</th>
                      <th className="text-right pb-2">Gap %</th>
                      <th className="text-right pb-2">Gap Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gap.byDepartment.map((row: any) => (
                      <tr key={row.department} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="py-2">{row.department}</td>
                        <td className="py-2 text-right font-mono text-xs">{formatINR(row.maleAvg)}</td>
                        <td className="py-2 text-right font-mono text-xs">{formatINR(row.femaleAvg)}</td>
                        <td className={cn('py-2 text-right font-semibold text-xs', gapColor(row.gapPercent))}>
                          {Math.abs(row.gapPercent).toFixed(1)}%
                        </td>
                        <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                          {formatINR(Math.abs(row.gapAmount), true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Heatmap Tab */}
      {activeTab === 'heatmap' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Compa-Ratio Heatmap</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" />{'<'}80%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" />80-110%</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" />{'>'}120%</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left p-2 font-medium text-muted-foreground bg-muted/30 border border-border w-28">Dept\Band</th>
                  {BANDS.map(b => (
                    <th key={b} className="text-center p-2 font-medium text-muted-foreground bg-muted/30 border border-border">
                      <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold', getBandColor(b))}>{b}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEPARTMENTS.map(dept => (
                  <tr key={dept}>
                    <td className="p-2 border border-border font-medium text-xs">{dept}</td>
                    {BANDS.map(band => {
                      const cell = heatmapMap.get(`${dept}:${band}`);
                      const cr = cell?.avgCompaRatio;
                      return (
                        <td key={band} className="p-2 border border-border text-center"
                          style={cr ? { backgroundColor: heatmapColor(cr) + '30', borderColor: heatmapColor(cr) + '60' } : {}}
                        >
                          {cr ? (
                            <div>
                              <p className="font-bold" style={{ color: heatmapColor(cr) }}>{cr.toFixed(0)}%</p>
                              <p className="text-muted-foreground text-[10px]">{cell?.count}p</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Distribution Tab */}
      {activeTab === 'distribution' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Compa-Ratio Distribution</h3>
          {dist.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dist} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Employees" radius={[3, 3, 0, 0]}>
                  {dist.map((entry: any) => {
                    const isGreen = ['80-90%', '90-100%', '100-110%', '110-120%'].includes(entry.label);
                    return <Cell key={entry.label} fill={isGreen ? '#22c55e' : '#ef4444'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 bg-muted/20 rounded animate-pulse" />
          )}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground">
            Green bars = healthy range (80-120%) · Red bars = outside bands
          </div>
        </div>
      )}

      {/* Outliers Tab */}
      {activeTab === 'outliers' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">
              Employees Outside Compa-Ratio Range
            </h3>
            <span className="ml-auto text-xs text-muted-foreground">{outliers.length} employees</span>
          </div>
          {!outliers.length ? (
            <div className="p-5 space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Band</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Gender</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Annual Fixed</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Compa-Ratio</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {outliers.map((emp: any) => (
                    <tr key={emp.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-muted-foreground">{emp.designation}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', getBandColor(emp.band))}>
                          {emp.band}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground capitalize">
                        {emp.gender?.toLowerCase()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatINR(Number(emp.annualFixed))}</td>
                      <td className={cn('px-4 py-3 text-right font-bold text-sm',
                        Number(emp.compaRatio) < 80 ? 'text-red-600' : 'text-orange-600'
                      )}>
                        {Number(emp.compaRatio).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          Number(emp.compaRatio) < 80
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        )}>
                          {Number(emp.compaRatio) < 80 ? 'Underpaid' : 'Overpaid'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
