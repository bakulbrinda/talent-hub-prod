import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3, Scale, Zap, Award, FlaskConical,
  TrendingUp, AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn } from '../lib/utils';

const MODULE_CARDS = [
  {
    path: '/salary-bands',
    label: 'Salary Bands',
    description: 'Design and manage compensation ranges by band and job area',
    icon: BarChart3,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
  },
  {
    path: '/pay-equity',
    label: 'Pay Equity',
    description: 'Analyze gender pay gaps, compa-ratios and outlier detection',
    icon: Scale,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    path: '/variable-pay',
    label: 'Variable Pay',
    description: 'Commission plans, targets and achievement tracking',
    icon: Zap,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
  },
  {
    path: '/rsu',
    label: 'RSU Tracker',
    description: 'RSU grants, vesting schedules and upcoming cliff events',
    icon: Award,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
  },
  {
    path: '/scenarios',
    label: 'Scenario Modeler',
    description: 'Model what-if salary changes and apply adjustments',
    icon: FlaskConical,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
];

function StatCard({
  label, value, subtitle, color = 'text-foreground', alert,
}: {
  label: string; value: string | number; subtitle?: string;
  color?: string; alert?: boolean;
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-4', alert && 'border-red-300 dark:border-red-800')}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-2xl font-bold mt-1', color, alert && 'text-red-600 dark:text-red-400')}>{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function CompensationHubPage() {
  const { data: kpisRaw, isLoading } = useQuery({
    queryKey: queryKeys.dashboard.kpis,
    queryFn: async () => { const r = await api.get('/dashboard/kpis'); return r.data; },
    staleTime: STALE_TIMES.LIVE,
  });

  const kpis: any = (kpisRaw as any)?.data ?? kpisRaw;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compensation &amp; Pay</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Central hub for all compensation modules
          </p>
        </div>
        <Link
          to="/pay-equity"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
        >
          Pay Equity Report <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 h-20 animate-pulse bg-muted/20" />
          ))
        ) : kpis ? (
          <>
            <StatCard
              label="Avg Compa-Ratio"
              value={`${(kpis.avgCompaRatio ?? 0).toFixed(1)}%`}
              subtitle="Market position"
              color={
                (kpis.avgCompaRatio ?? 0) < 80
                  ? 'text-red-600'
                  : (kpis.avgCompaRatio ?? 0) > 120
                  ? 'text-orange-600'
                  : 'text-green-600'
              }
            />
            <StatCard
              label="Outside Salary Band"
              value={kpis.employeesOutsideBand ?? 0}
              subtitle="Employees needing attention"
              alert={(kpis.employeesOutsideBand ?? 0) > 0}
            />
            <StatCard
              label="Gender Pay Gap"
              value={`${Math.abs(kpis.genderPayGapPercent ?? 0).toFixed(1)}%`}
              subtitle="Male vs female avg fixed"
              color={
                Math.abs(kpis.genderPayGapPercent ?? 0) < 5
                  ? 'text-green-600'
                  : Math.abs(kpis.genderPayGapPercent ?? 0) < 10
                  ? 'text-amber-600'
                  : 'text-red-600'
              }
            />
          </>
        ) : null}
      </div>

      {/* Alert banner if outside-band employees */}
      {kpis && (kpis.employeesOutsideBand ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {kpis.employeesOutsideBand} employee{kpis.employeesOutsideBand !== 1 ? 's' : ''} currently outside salary band
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Review salary bands and adjust employee compensation accordingly
            </p>
          </div>
          <Link
            to="/salary-bands"
            className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline whitespace-nowrap"
          >
            Review Bands →
          </Link>
        </div>
      )}

      {/* Module cards */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULE_CARDS.map(({ path, label, description, icon: Icon, color, bg }) => (
            <Link
              key={path}
              to={path}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', bg)}>
                <Icon className={cn('w-5 h-5', color)} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {label}
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-auto">
                <TrendingUp className="w-3 h-3" /> Open Module
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
