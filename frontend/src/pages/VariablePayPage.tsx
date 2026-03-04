import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, TrendingUp, Users, DollarSign } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

export default function VariablePayPage() {
  const { data: empRaw, isLoading } = useQuery({
    queryKey: ['employees-vp'],
    queryFn: async () => { const r = await api.get('/employees?limit=2000'); return r.data; },
    staleTime: 5 * 60 * 1000,
  });

  const employees: any[] = useMemo(() => {
    const raw = empRaw as any;
    return raw?.data ?? (Array.isArray(raw) ? raw : []);
  }, [empRaw]);

  // Only employees who have a variable pay component
  const withVariable = useMemo(() =>
    employees.filter(e => Number(e.variablePay) > 0),
    [employees]
  );

  const totalVariableLakhs = useMemo(() =>
    withVariable.reduce((s, e) => s + Number(e.variablePay), 0) / 100000,
    [withVariable]
  );

  const avgVariablePct = useMemo(() => {
    if (withVariable.length === 0) return 0;
    const pcts = withVariable.map(e =>
      Number(e.annualFixed) > 0 ? (Number(e.variablePay) / Number(e.annualFixed)) * 100 : 0
    );
    return pcts.reduce((s, v) => s + v, 0) / pcts.length;
  }, [withVariable]);

  const topEarner = useMemo(() =>
    withVariable.length > 0
      ? withVariable.reduce((a, b) => Number(a.variablePay) > Number(b.variablePay) ? a : b)
      : null,
    [withVariable]
  );

  // Variable pay by department (sorted descending by total)
  const byDept = useMemo(() => {
    const map: Record<string, { total: number; count: number; avgPct: number; pcts: number[] }> = {};
    for (const e of withVariable) {
      const d = e.department || 'Unknown';
      if (!map[d]) map[d] = { total: 0, count: 0, avgPct: 0, pcts: [] };
      map[d].total += Number(e.variablePay);
      map[d].count++;
      if (Number(e.annualFixed) > 0)
        map[d].pcts.push((Number(e.variablePay) / Number(e.annualFixed)) * 100);
    }
    return Object.entries(map)
      .map(([dept, v]) => ({
        dept,
        totalLakhs: v.total / 100000,
        count: v.count,
        avgPct: v.pcts.length > 0 ? v.pcts.reduce((s, x) => s + x, 0) / v.pcts.length : 0,
      }))
      .sort((a, b) => b.totalLakhs - a.totalLakhs);
  }, [withVariable]);

  // Variable pay % of fixed by band
  const byBand = useMemo(() => {
    const BAND_ORDER = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
    const map: Record<string, { pcts: number[]; totalLakhs: number }> = {};
    for (const e of withVariable) {
      const b = e.band || 'Unknown';
      if (!map[b]) map[b] = { pcts: [], totalLakhs: 0 };
      map[b].totalLakhs += Number(e.variablePay) / 100000;
      if (Number(e.annualFixed) > 0)
        map[b].pcts.push((Number(e.variablePay) / Number(e.annualFixed)) * 100);
    }
    return Object.entries(map)
      .map(([band, v]) => ({
        band,
        avgPct: v.pcts.length > 0 ? v.pcts.reduce((s, x) => s + x, 0) / v.pcts.length : 0,
        totalLakhs: v.totalLakhs,
        count: v.pcts.length,
      }))
      .sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band));
  }, [withVariable]);

  // Top 15 earners
  const topEarners = useMemo(() =>
    [...withVariable]
      .sort((a, b) => Number(b.variablePay) - Number(a.variablePay))
      .slice(0, 15),
    [withVariable]
  );

  const maxDeptTotal = byDept.length > 0 ? byDept[0].totalLakhs : 1;
  const maxBandPct = byBand.length > 0 ? Math.max(...byBand.map(b => b.avgPct), 1) : 1;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Variable Pay</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Variable pay analytics derived from compensation data — {employees.length} employees · {withVariable.length} with variable component
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Variable Budget',
            value: `₹${totalVariableLakhs.toFixed(1)}L`,
            sub: 'annual across org',
            icon: DollarSign,
            color: 'text-blue-600',
          },
          {
            label: 'Avg Variable %',
            value: `${avgVariablePct.toFixed(1)}%`,
            sub: 'of annual fixed',
            icon: TrendingUp,
            color: 'text-green-600',
          },
          {
            label: 'Employees w/ Variable',
            value: withVariable.length,
            sub: `of ${employees.length} total`,
            icon: Users,
            color: 'text-purple-600',
          },
          {
            label: 'Highest Variable Pay',
            value: topEarner ? `₹${(Number(topEarner.variablePay) / 100000).toFixed(1)}L` : '—',
            sub: topEarner ? `${topEarner.firstName} ${topEarner.lastName}` : '',
            icon: Zap,
            color: 'text-orange-600',
          },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={cn('w-4 h-4', kpi.color)} />
              <span className="text-xs text-muted-foreground">{kpi.label}</span>
            </div>
            <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
            {kpi.sub && <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Variable Pay by Department */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Total Variable Pay by Department</h3>
          <div className="space-y-3">
            {byDept.map(d => (
              <div key={d.dept} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground font-medium truncate max-w-[160px]">{d.dept}</span>
                  <span className="text-muted-foreground flex-shrink-0 ml-2">
                    ₹{d.totalLakhs.toFixed(1)}L · {d.count} emp · {d.avgPct.toFixed(1)}% avg
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${(d.totalLakhs / maxDeptTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {byDept.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No variable pay data in compensation file</p>
            )}
          </div>
        </div>

        {/* Avg Variable % by Band */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Avg Variable % of Fixed by Band</h3>
          <div className="space-y-3">
            {byBand.map(b => (
              <div key={b.band} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="w-10 text-foreground font-medium">{b.band}</span>
                  <span className="text-muted-foreground">{b.count} employees</span>
                  <span className="font-semibold text-foreground">{b.avgPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      b.avgPct >= 20 ? 'bg-purple-500' : b.avgPct >= 10 ? 'bg-blue-500' : 'bg-green-500'
                    )}
                    style={{ width: `${(b.avgPct / maxBandPct) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {byBand.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No variable pay data in compensation file</p>
            )}
          </div>
        </div>
      </div>

      {/* Top Earners Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Top 15 Employees by Variable Pay</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {['#', 'Employee', 'Department', 'Band', 'Annual Fixed', 'Variable Pay', 'Variable %'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {topEarners.map((e, i) => {
              const vp = Number(e.variablePay);
              const fixed = Number(e.annualFixed);
              const pct = fixed > 0 ? (vp / fixed) * 100 : 0;
              return (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{e.firstName} {e.lastName}</p>
                    <p className="text-xs text-muted-foreground">{e.designation}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{e.department}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{e.band}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">₹{(fixed / 100000).toFixed(1)}L</td>
                  <td className="px-4 py-3 font-medium text-foreground">₹{(vp / 100000).toFixed(1)}L</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'font-medium',
                      pct >= 25 ? 'text-purple-600' : pct >= 15 ? 'text-blue-600' : 'text-green-600'
                    )}>
                      {pct.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {topEarners.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No variable pay data found. Ensure your compensation CSV includes the "Variable Pay" column.</p>
          </div>
        )}
      </div>
    </div>
  );
}
