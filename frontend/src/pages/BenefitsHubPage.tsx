import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Gift, BookOpen, Users, BarChart2, TrendingUp, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { STALE_TIMES } from '../lib/queryClient';
import { cn } from '../lib/utils';

const MODULE_CARDS = [
  {
    path: '/benefits',
    anchor: 'catalog',
    label: 'Benefits Catalog',
    description: 'Browse all available benefits: health, wellness, retirement and more',
    icon: BookOpen,
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
  },
  {
    path: '/benefits',
    anchor: 'enrollments',
    label: 'Enrollments',
    description: 'Track employee benefit enrollments and coverage status',
    icon: Users,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    path: '/benefits',
    anchor: 'utilization',
    label: 'Utilization',
    description: 'Analyze benefit usage rates and cost by category',
    icon: BarChart2,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
];

function StatCard({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function BenefitsHubPage() {
  const { data: summaryRaw } = useQuery({
    queryKey: ['benefits', 'category-summary'],
    queryFn: async () => { const r = await api.get('/benefits/category-summary'); return r.data; },
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: utilizationRaw } = useQuery({
    queryKey: ['benefits', 'utilization'],
    queryFn: async () => { const r = await api.get('/benefits/utilization'); return r.data; },
    staleTime: STALE_TIMES.SHORT,
  });

  const summary: any[] = (summaryRaw as any)?.data ?? (Array.isArray(summaryRaw) ? summaryRaw : []);
  const utilization: any = (utilizationRaw as any)?.data ?? utilizationRaw;

  const totalBenefits = summary.reduce((acc: number, s: any) => acc + (s.count ?? 0), 0);
  const enrolledCount = utilization?.totalEnrolled ?? utilization?.enrolled ?? '—';
  const utilizationRate = utilization?.utilizationRate ?? utilization?.rate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Benefits</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Central hub for all employee benefits
          </p>
        </div>
        <Link
          to="/benefits"
          className="flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
        >
          Full Benefits View <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Benefits Available"
          value={totalBenefits || '—'}
          subtitle="Active catalog items"
        />
        <StatCard
          label="Total Enrollments"
          value={enrolledCount}
          subtitle="Active employee enrollments"
        />
        <StatCard
          label="Utilization Rate"
          value={utilizationRate != null ? `${Number(utilizationRate).toFixed(0)}%` : '—'}
          subtitle="Benefits being used"
        />
      </div>

      {/* Category breakdown */}
      {summary.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Benefits by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {summary.map((cat: any) => (
              <div key={cat.category} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                <Gift className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{cat.category}</p>
                  <p className="text-xs text-muted-foreground">{cat.count} benefit{cat.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module cards */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {MODULE_CARDS.map(({ path, label, description, icon: Icon, color, bg }) => (
            <Link
              key={label}
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
