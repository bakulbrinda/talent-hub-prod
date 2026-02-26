import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, DollarSign, TrendingUp, AlertTriangle, Scale,
  BarChart3, Layers, Sparkles, GitBranch,
  Gift, Award, Settings, Bell, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, formatINR, getBandColor } from '../lib/utils';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Services ──────────────────────────────────────────────────
const dashboardApi = {
  getKpis: async () => { const r = await api.get('/dashboard/kpis'); return r.data; },
  getBandDistribution: async () => { const r = await api.get('/dashboard/band-distribution'); return r.data; },
  getSalaryDistribution: async () => { const r = await api.get('/dashboard/salary-distribution'); return r.data; },
  getCompensationTrend: async () => { const r = await api.get('/dashboard/compensation-trend'); return r.data; },
  getPayEquitySummary: async () => { const r = await api.get('/dashboard/pay-equity-summary'); return r.data; },
};

// 10 colours — one per level: A1 A2 | P1 P2 | P3 | M1 M2 | D0 D1 D2
const BAND_PIE_COLORS = ['#64748b','#3b82f6','#6366f1','#8b5cf6','#a855f7','#f59e0b','#f97316','#f43f5e','#ef4444','#ec4899'];

// ── KPI Card ──────────────────────────────────────────────────
function KPICard({
  title, value, subtitle, icon: Icon, color = 'text-foreground',
  bg = 'bg-card', trend, alert,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color?: string;
  bg?: string;
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string };
  alert?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-border p-5', bg)}>
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
  { to: '/employees', label: 'Employee Directory', icon: Users, color: 'text-blue-500' },
  { to: '/job-architecture', label: 'Job Architecture', icon: Layers, color: 'text-indigo-500' },
  { to: '/salary-bands', label: 'Salary Bands', icon: BarChart3, color: 'text-violet-500' },
  { to: '/pay-equity', label: 'Pay Equity', icon: Scale, color: 'text-purple-500' },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles, color: 'text-pink-500' },
  { to: '/performance', label: 'Performance', icon: TrendingUp, color: 'text-emerald-500' },
  { to: '/benefits', label: 'Benefits', icon: Gift, color: 'text-teal-500' },
  { to: '/rsu', label: 'RSU Tracker', icon: Award, color: 'text-cyan-500' },
  { to: '/variable-pay', label: 'Variable Pay', icon: DollarSign, color: 'text-sky-500' },
  { to: '/scenarios', label: 'Scenarios', icon: GitBranch, color: 'text-orange-500' },
  { to: '/notifications', label: 'Notifications', icon: Bell, color: 'text-amber-500' },
  { to: '/settings', label: 'Settings', icon: Settings, color: 'text-gray-500' },
];

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


  const kpis: any = (kpisRaw as any)?.data ?? kpisRaw;
  const bandDist: any[] = (bandDistRaw as any)?.data ?? (Array.isArray(bandDistRaw) ? bandDistRaw : []);
  const salaryDist: any[] = (salaryDistRaw as any)?.data ?? (Array.isArray(salaryDistRaw) ? salaryDistRaw : []);
  const gapColor = (pct: number) =>
    Math.abs(pct) < 5 ? 'text-green-600' : Math.abs(pct) < 10 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Real-time compensation intelligence overview</p>
      </div>

      {/* ── Row 1: KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpisLoading ? (
          Array.from({ length: 5 }).map((_, i) => <KPISkeleton key={i} />)
        ) : kpis ? (
          <>
            <KPICard
              title="Total Employees"
              value={kpis.totalEmployees?.toLocaleString('en-IN')}
              icon={Users}
              subtitle="Active headcount"
            />
            <KPICard
              title="Annual CTC"
              value={`₹${(kpis.totalAnnualCtcCrores ?? 0).toFixed(1)}Cr`}
              icon={DollarSign}
              subtitle="Total compensation spend"
            />
            <KPICard
              title="Avg Compa-Ratio"
              value={`${(kpis.avgCompaRatio ?? 0).toFixed(1)}%`}
              icon={TrendingUp}
              subtitle="Market position"
              color={(kpis.avgCompaRatio ?? 0) < 80 ? 'text-red-600' : (kpis.avgCompaRatio ?? 0) > 120 ? 'text-orange-600' : 'text-green-600'}
            />
            <KPICard
              title="Outside Bands"
              value={kpis.employeesOutsideBand ?? 0}
              icon={AlertTriangle}
              subtitle="Need attention"
              alert={(kpis.employeesOutsideBand ?? 0) > 0}
            />
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

      {/* ── Row 2: Charts ── */}
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
            <div className="h-56 flex items-center justify-center bg-muted/20 rounded-lg">
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
                  <Pie
                    data={bandDist}
                    dataKey="count"
                    nameKey="band"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
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

      {/* ── Row 3: Quick Links ── */}
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
                <Icon className={cn('w-4.5 h-4.5', color)} style={{ width: 18, height: 18 }} />
              </div>
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
