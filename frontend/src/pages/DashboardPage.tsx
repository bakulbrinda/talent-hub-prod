import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, DollarSign, TrendingUp, AlertTriangle, Scale,
  BarChart3, Layers, Sparkles, GitBranch,
  Gift, Award, Settings, Bell, ArrowUpRight, ArrowDownRight,
  ChevronRight, Building2, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, getBandColor } from '../lib/utils';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ZAxis,
} from 'recharts';

// ── Services ──────────────────────────────────────────────────
const dashboardApi = {
  getKpis: async () => { const r = await api.get('/dashboard/kpis'); return r.data; },
  getBandDistribution: async () => { const r = await api.get('/dashboard/band-distribution'); return r.data; },
  getSalaryDistribution: async () => { const r = await api.get('/dashboard/salary-distribution'); return r.data; },
  getCompVsPerformance: async () => { const r = await api.get('/dashboard/comp-vs-performance'); return r.data; },
  getDeptPayEquityHeatmap: async () => { const r = await api.get('/dashboard/dept-pay-equity-heatmap'); return r.data; },
  getRsuVestingTimeline: async () => { const r = await api.get('/dashboard/rsu-vesting-timeline'); return r.data; },
  getAttritionRisk: async () => { const r = await api.get('/dashboard/attrition-risk'); return r.data; },
  getActionRequired: async () => { const r = await api.get('/dashboard/action-required'); return r.data; },
};

const BAND_PIE_COLORS = ['#64748b','#3b82f6','#6366f1','#8b5cf6','#a855f7','#f59e0b'];
const ATTRITION_COLORS: Record<string, string> = { Low: '#22c55e', Medium: '#f59e0b', High: '#ef4444' };

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({
  title, value, subtitle, icon: Icon, color = 'text-foreground', trend, alert,
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color?: string;
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string }; alert?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-border p-5 bg-card')}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className={cn('text-2xl font-bold mt-1.5 truncate', color, alert && 'text-red-600 dark:text-red-400')}>
            {value}
          </p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          {trend && (
            <div className={cn('flex items-center gap-1 mt-1.5 text-xs font-medium',
              trend.direction === 'up' ? 'text-green-600' : trend.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'
            )}>
              {trend.direction === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend.direction === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
              {trend.label}
            </div>
          )}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-3',
          alert ? 'bg-red-100 dark:bg-red-900/30' : 'bg-primary/10'
        )}>
          <Icon className={cn('w-5 h-5', alert ? 'text-red-600 dark:text-red-400' : 'text-primary')} />
        </div>
      </div>
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="rounded-xl border border-border p-5 bg-card">
      <div className="h-3 w-24 bg-muted/60 rounded animate-pulse mb-3" />
      <div className="h-7 w-32 bg-muted/60 rounded animate-pulse mb-2" />
      <div className="h-3 w-20 bg-muted/60 rounded animate-pulse" />
    </div>
  );
}

// ── Quick Links ───────────────────────────────────────────────
const QUICK_LINKS = [
  { to: '/compensation', label: 'Compensation Hub', icon: Building2, color: 'text-violet-500' },
  { to: '/benefits-hub', label: 'Benefits Hub', icon: Gift, color: 'text-teal-500' },
  { to: '/employees', label: 'Employees', icon: Users, color: 'text-blue-500' },
  { to: '/pay-equity', label: 'Pay Equity', icon: Scale, color: 'text-purple-500' },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles, color: 'text-pink-500' },
  { to: '/performance', label: 'Performance', icon: TrendingUp, color: 'text-emerald-500' },
  { to: '/salary-bands', label: 'Salary Bands', icon: BarChart3, color: 'text-indigo-500' },
  { to: '/rsu', label: 'RSU Tracker', icon: Award, color: 'text-cyan-500' },
  { to: '/variable-pay', label: 'Variable Pay', icon: Zap, color: 'text-sky-500' },
  { to: '/scenarios', label: 'Scenarios', icon: GitBranch, color: 'text-orange-500' },
  { to: '/notifications', label: 'Notifications', icon: Bell, color: 'text-amber-500' },
  { to: '/job-architecture', label: 'Job Architecture', icon: Layers, color: 'text-rose-500' },
];

const ACTION_ICON: Record<string, React.ElementType> = {
  band: AlertTriangle, equity: Scale, rsu: Award, performance: TrendingUp,
};

export default function DashboardPage() {
  const { data: kpisRaw, isLoading: kpisLoading } = useQuery({
    queryKey: queryKeys.dashboard.kpis,
    queryFn: dashboardApi.getKpis,
    staleTime: STALE_TIMES.LIVE,
  });

  const { data: bandDistRaw } = useQuery({
    queryKey: queryKeys.dashboard.bandDistribution,
    queryFn: dashboardApi.getBandDistribution,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: salaryDistRaw } = useQuery({
    queryKey: queryKeys.dashboard.salaryDistribution,
    queryFn: dashboardApi.getSalaryDistribution,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: compVsPerfRaw } = useQuery({
    queryKey: ['dashboard', 'comp-vs-performance'],
    queryFn: dashboardApi.getCompVsPerformance,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: deptHeatmapRaw } = useQuery({
    queryKey: ['dashboard', 'dept-pay-equity-heatmap'],
    queryFn: dashboardApi.getDeptPayEquityHeatmap,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: rsuTimelineRaw } = useQuery({
    queryKey: ['dashboard', 'rsu-vesting-timeline'],
    queryFn: dashboardApi.getRsuVestingTimeline,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: attritionRaw } = useQuery({
    queryKey: ['dashboard', 'attrition-risk'],
    queryFn: dashboardApi.getAttritionRisk,
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: actionRaw } = useQuery({
    queryKey: ['dashboard', 'action-required'],
    queryFn: dashboardApi.getActionRequired,
    staleTime: STALE_TIMES.LIVE,
  });

  const kpis: any = (kpisRaw as any)?.data ?? kpisRaw;
  const bandDist: any[] = (bandDistRaw as any)?.data ?? (Array.isArray(bandDistRaw) ? bandDistRaw : []);
  const salaryDist: any[] = (salaryDistRaw as any)?.data ?? (Array.isArray(salaryDistRaw) ? salaryDistRaw : []);
  const compVsPerf: any[] = (compVsPerfRaw as any)?.data ?? (Array.isArray(compVsPerfRaw) ? compVsPerfRaw : []);
  const deptHeatmap: any[] = (deptHeatmapRaw as any)?.data ?? (Array.isArray(deptHeatmapRaw) ? deptHeatmapRaw : []);
  const rsuTimeline: any[] = (rsuTimelineRaw as any)?.data ?? (Array.isArray(rsuTimelineRaw) ? rsuTimelineRaw : []);
  const attrition: any[] = (attritionRaw as any)?.data ?? (Array.isArray(attritionRaw) ? attritionRaw : []);
  const actionItems: any[] = (actionRaw as any)?.data ?? (Array.isArray(actionRaw) ? actionRaw : []);

  const gapColor = (pct: number) =>
    Math.abs(pct) < 5 ? 'text-green-600' : Math.abs(pct) < 10 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time compensation intelligence overview</p>
      </div>

      {/* ── Action Required Panel ── */}
      {actionItems.length > 0 && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Action Required</h3>
          </div>
          <div className="space-y-2">
            {actionItems.map((item: any, i: number) => {
              const Icon = ACTION_ICON[item.type] ?? AlertTriangle;
              return (
                <Link
                  key={i}
                  to={item.link}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    item.severity === 'high'
                      ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50'
                      : 'border-amber-200 dark:border-amber-800 bg-white dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                  )}
                >
                  <Icon className={cn('w-4 h-4 flex-shrink-0',
                    item.severity === 'high' ? 'text-red-500' : 'text-amber-500'
                  )} />
                  <span className="flex-1 text-sm text-foreground">{item.message}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpisLoading ? (
          Array.from({ length: 5 }).map((_, i) => <KPISkeleton key={i} />)
        ) : kpis ? (
          <>
            <KPICard title="Total Employees" value={kpis.totalEmployees?.toLocaleString('en-IN')} icon={Users} subtitle="Active headcount" />
            <KPICard title="Annual CTC" value={`₹${(kpis.totalAnnualCtcCrores ?? 0).toFixed(1)}Cr`} icon={DollarSign} subtitle="Total compensation spend" />
            <KPICard
              title="Avg Compa-Ratio"
              value={`${(kpis.avgCompaRatio ?? 0).toFixed(1)}%`}
              icon={TrendingUp}
              subtitle="Market position"
              color={(kpis.avgCompaRatio ?? 0) < 80 ? 'text-red-600' : (kpis.avgCompaRatio ?? 0) > 120 ? 'text-orange-600' : 'text-green-600'}
            />
            <KPICard title="Outside Bands" value={kpis.employeesOutsideBand ?? 0} icon={AlertTriangle} subtitle="Need attention" alert={(kpis.employeesOutsideBand ?? 0) > 0} />
            <KPICard
              title="Gender Pay Gap"
              value={`${Math.abs(kpis.genderPayGapPercent ?? 0).toFixed(1)}%`}
              icon={Scale}
              subtitle="Male vs Female avg"
              color={gapColor(kpis.genderPayGapPercent ?? 0)}
            />
          </>
        ) : null}
      </div>

      {/* ── Row 2: Salary Dist + Band Dist ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Salary Distribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Salary Distribution</h3>
          {salaryDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={salaryDist} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Employees" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Band Distribution Donut */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Headcount by Band</h3>
          {bandDist.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={bandDist} dataKey="count" nameKey="band" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {bandDist.map((_entry, index) => (
                      <Cell key={index} fill={BAND_PIE_COLORS[index % BAND_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, `Band ${name}`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {bandDist.map((item, i) => (
                  <div key={item.band} className="flex items-center gap-2 text-sm">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: BAND_PIE_COLORS[i % BAND_PIE_COLORS.length] }} />
                    <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold', getBandColor(item.band))}>{item.band}</span>
                    <span className="text-foreground font-medium ml-auto">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-40 rounded-full bg-muted/30 animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Comp vs Performance Scatter + Dept Pay Equity Heatmap ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Comp vs Performance Scatter */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Compensation vs Performance</h3>
          <p className="text-xs text-muted-foreground mb-4">Compa-ratio on X · Performance rating on Y · Size = tenure</p>
          {compVsPerf.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="compaRatio"
                  name="Compa-Ratio"
                  type="number"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'Compa-Ratio (%)', position: 'insideBottom', offset: -2, fontSize: 10 }}
                />
                <YAxis
                  dataKey="performanceRating"
                  name="Rating"
                  type="number"
                  domain={[1, 5]}
                  tick={{ fontSize: 10 }}
                  label={{ value: 'Rating', angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <ZAxis dataKey="tenureMonths" range={[20, 200]} name="Tenure (months)" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
                        <p className="font-medium text-foreground">{d.name}</p>
                        <p className="text-muted-foreground">{d.department} · {d.band}</p>
                        <p>Compa-ratio: <span className="font-medium">{d.compaRatio.toFixed(1)}%</span></p>
                        <p>Rating: <span className="font-medium">{d.performanceRating}</span></p>
                        <p>Tenure: <span className="font-medium">{d.tenureMonths}mo</span></p>
                      </div>
                    );
                  }}
                />
                <Scatter data={compVsPerf} fill="hsl(var(--primary))" fillOpacity={0.65} />
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Dept Pay Equity Heatmap */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Department Pay Equity</h3>
          <p className="text-xs text-muted-foreground mb-4">Avg fixed pay by gender across departments</p>
          {deptHeatmap.length > 0 ? (
            <div className="overflow-y-auto max-h-56 space-y-2 pr-1">
              {deptHeatmap.slice(0, 8).map((dept: any) => {
                const gap = Math.abs(dept.gapPercent ?? 0);
                const barColor = gap > 20 ? 'bg-red-500' : gap > 10 ? 'bg-amber-500' : 'bg-green-500';
                return (
                  <div key={dept.department}>
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="text-xs font-medium text-foreground truncate max-w-[140px]">{dept.department}</span>
                      <span className={cn('text-xs font-bold', gap > 20 ? 'text-red-600' : gap > 10 ? 'text-amber-600' : 'text-green-600')}>
                        {gap.toFixed(1)}% gap
                      </span>
                    </div>
                    <div className="flex gap-1 h-3">
                      <div className="flex-1 bg-muted/40 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.min(gap * 2.5, 100)}%` }} />
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>♂ ₹{(dept.maleAvg / 100000).toFixed(1)}L</span>
                      <span>♀ ₹{(dept.femaleAvg / 100000).toFixed(1)}L</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: RSU Vesting Timeline + Attrition Risk ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* RSU Vesting Timeline */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">RSU Vesting Timeline</h3>
          <p className="text-xs text-muted-foreground mb-4">Monthly vesting events — next 12 months</p>
          {rsuTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={rsuTimeline} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-lg p-2 text-xs shadow-lg">
                        <p className="font-medium">{label}</p>
                        <p>{d.count} event{d.count !== 1 ? 's' : ''} · {d.units.toLocaleString()} units</p>
                        {d.approxValue > 0 && <p>~₹{(d.approxValue / 100000).toFixed(1)}L value</p>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" name="Vesting Events" fill="#06b6d4" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>

        {/* Attrition Risk Distribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-1">Attrition Risk Distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">Headcount by predicted attrition risk score</p>
          {attrition.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={attrition} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="risk" tick={{ fontSize: 12, fontWeight: 500 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [value, 'Employees']} />
                <Bar dataKey="count" name="Employees" radius={[4, 4, 0, 0]}>
                  {attrition.map((entry: any) => (
                    <Cell key={entry.risk} fill={ATTRITION_COLORS[entry.risk] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* ── Row 5: Quick Links ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Quick Navigation</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {QUICK_LINKS.map(({ to, label, icon: Icon, color }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-center group"
            >
              <div className="w-9 h-9 rounded-xl bg-muted/40 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                <Icon className={cn(color)} style={{ width: 18, height: 18 }} />
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
