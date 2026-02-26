import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp, AlertTriangle, Edit2, X } from 'lucide-react';
import { toast } from 'sonner';
import { salaryBandService } from '../services/salaryBand.service';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, formatINR, getBandColor } from '../lib/utils';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const TABS = [
  { id: 'chart', label: 'Band Chart' },
  { id: 'editor', label: 'Range Editor' },
  { id: 'outliers', label: 'Outliers' },
] as const;
type TabId = typeof TABS[number]['id'];

const BAND_ORDER = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];

function SalaryBandTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs max-w-52">
      <p className="font-semibold text-foreground mb-2">{d.band}</p>
      <div className="space-y-1">
        {[
          { label: 'Min', val: d.min, color: 'text-red-600' },
          { label: 'Mid', val: d.mid, color: 'text-blue-600 font-bold' },
          { label: 'Max', val: d.max, color: 'text-green-600' },
          d.p50 && { label: 'P50 Market', val: d.p50, color: 'text-emerald-500' },
        ].filter(Boolean).map((item: any) => (
          <div key={item.label} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{item.label}</span>
            <span className={cn('font-mono', item.color)}>{formatINR(item.val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const EMPTY_FORM = { bandId: '', minSalary: '', midSalary: '', maxSalary: '', effectiveDate: new Date().toISOString().slice(0, 10) };

export default function SalaryBandDesignerPage() {
  const [activeTab, setActiveTab] = useState<TabId>('chart');
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const qc = useQueryClient();

  const { data: bandsRaw, isLoading } = useQuery({
    queryKey: queryKeys.salaryBands.all(),
    queryFn: () => salaryBandService.getAll(),
    staleTime: STALE_TIMES.LONG,
  });

  const { data: benchmarksRaw } = useQuery({
    queryKey: queryKeys.salaryBands.benchmarks(),
    queryFn: () => salaryBandService.getMarketBenchmarks(),
    staleTime: STALE_TIMES.LONG,
  });

  const { data: outliersRaw, isLoading: outliersLoading } = useQuery({
    queryKey: queryKeys.salaryBands.outliers,
    queryFn: () => salaryBandService.getOutliers(),
    staleTime: STALE_TIMES.SHORT,
  });

  const { data: allBandsRaw } = useQuery({
    queryKey: queryKeys.jobArchitecture.bands,
    queryFn: async () => { const r = await api.get('/bands'); return r.data; },
    staleTime: STALE_TIMES.LONG,
  });
  const allBands: any[] = (allBandsRaw as any)?.data ?? (Array.isArray(allBandsRaw) ? allBandsRaw : []);

  const createMutation = useMutation({
    mutationFn: () => salaryBandService.create({
      bandId: form.bandId,
      minSalary: Number(form.minSalary),
      midSalary: Number(form.midSalary),
      maxSalary: Number(form.maxSalary),
      effectiveDate: new Date(form.effectiveDate),
    }),
    onSuccess: () => {
      toast.success('Salary band created');
      qc.invalidateQueries({ queryKey: ['salary-bands'] });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  const bands: any[] = (bandsRaw as any)?.data ?? (Array.isArray(bandsRaw) ? bandsRaw : []);
  const benchmarks: any[] = (benchmarksRaw as any)?.data ?? (Array.isArray(benchmarksRaw) ? benchmarksRaw : []);
  const outliers: any[] = (outliersRaw as any)?.data ?? (Array.isArray(outliersRaw) ? outliersRaw : []);

  // Build chart data — one entry per unique band code, picking first salary band found
  const bandMap = new Map<string, any>();
  for (const sb of bands) {
    const code = sb.band?.code;
    if (!code || bandMap.has(code)) continue;
    const min = Number(sb.minSalary);
    const mid = Number(sb.midSalary);
    const max = Number(sb.maxSalary);
    bandMap.set(code, { band: code, min, mid, max, rangeBase: min, rangeSize: max - min });
  }

  // Overlay benchmark data
  for (const bm of benchmarks) {
    const code = bm.band?.code;
    if (!code || !bandMap.has(code)) continue;
    const entry = bandMap.get(code)!;
    if (!entry.p25) entry.p25 = Number(bm.p25);
    if (!entry.p50) entry.p50 = Number(bm.p50);
    if (!entry.p75) entry.p75 = Number(bm.p75);
    if (!entry.p90) entry.p90 = Number(bm.p90);
  }

  const chartData = BAND_ORDER.filter(c => bandMap.has(c)).map(c => bandMap.get(c)!);
  const hasP50 = chartData.some(d => d.p50);
  const hasP75 = chartData.some(d => d.p75);
  const hasP25 = chartData.some(d => d.p25);

  const formatYAxis = (val: number) => `₹${(val / 100000).toFixed(0)}L`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Salary Band Designer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Design and visualize compensation ranges with market benchmarks
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Band
        </button>
      </div>

      {/* KPI pills */}
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-2 rounded-lg border border-border bg-card text-sm">
          <span className="text-muted-foreground">Bands defined: </span>
          <span className="font-semibold text-foreground">{chartData.length}</span>
        </div>
        {outliers.length > 0 && (
          <div className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 text-sm">
            <span className="text-red-600 dark:text-red-400">Outside bands: </span>
            <span className="font-semibold text-red-700 dark:text-red-300">{outliers.length}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.id === 'outliers' && outliers.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold dark:bg-red-900/30 dark:text-red-400">
                  {outliers.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Band Chart ── */}
      {activeTab === 'chart' && (
        <div className="rounded-xl border border-border bg-card p-5">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-5 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-3 rounded bg-primary/20 border border-primary/40" />
              <span className="text-muted-foreground">Band Range</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-8 border-t-2 border-blue-500" />
              <span className="text-muted-foreground">Midpoint</span>
            </div>
            {hasP50 && (
              <div className="flex items-center gap-1.5">
                <div className="w-8 border-t-2 border-emerald-500 border-dashed" />
                <span className="text-muted-foreground">P50 Market</span>
              </div>
            )}
            {hasP75 && (
              <div className="flex items-center gap-1.5">
                <div className="w-8 border-t-2 border-amber-500 border-dashed" />
                <span className="text-muted-foreground">P75 Market</span>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="h-72 bg-muted/30 rounded animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">
              No salary bands configured
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="band" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} width={60} />
                <Tooltip content={<SalaryBandTooltip />} />
                <Legend />

                {/* Stacked bars: invisible base to position range */}
                <Bar dataKey="rangeBase" stackId="band" fill="transparent" legendType="none" name="Base" />
                <Bar dataKey="rangeSize" stackId="band" name="Salary Range" fill="hsl(215 25% 60% / 0.2)" stroke="hsl(215 25% 60% / 0.5)" strokeWidth={1} radius={[3, 3, 0, 0]} />

                {/* Midpoint */}
                <Line type="monotone" dataKey="mid" name="Midpoint" stroke="hsl(221 83% 53%)" strokeWidth={2.5} dot={{ r: 5, fill: 'hsl(221 83% 53%)', strokeWidth: 2, stroke: '#fff' }} />

                {/* Market benchmarks */}
                {hasP25 && <Line type="monotone" dataKey="p25" name="P25 Market" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3 }} />}
                {hasP50 && <Line type="monotone" dataKey="p50" name="P50 Market" stroke="#10b981" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4 }} />}
                {hasP75 && <Line type="monotone" dataKey="p75" name="P75 Market" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={{ r: 3 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          )}

          {/* Detail table */}
          {chartData.length > 0 && (
            <div className="mt-5 overflow-x-auto border-t border-border pt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs font-medium">
                    <th className="text-left pb-2 px-1">Band</th>
                    <th className="text-right pb-2 px-1">Min</th>
                    <th className="text-right pb-2 px-1">Mid</th>
                    <th className="text-right pb-2 px-1">Max</th>
                    <th className="text-right pb-2 px-1">P50 Market</th>
                    <th className="text-right pb-2 px-1">Spread</th>
                    <th className="text-center pb-2 px-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map(row => (
                    <tr key={row.band} className="border-t border-border/40 hover:bg-muted/20">
                      <td className="py-2 px-1">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', getBandColor(row.band))}>
                          {row.band}
                        </span>
                      </td>
                      <td className="py-2 px-1 text-right font-mono text-xs">{formatINR(row.min)}</td>
                      <td className="py-2 px-1 text-right font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{formatINR(row.mid)}</td>
                      <td className="py-2 px-1 text-right font-mono text-xs">{formatINR(row.max)}</td>
                      <td className="py-2 px-1 text-right font-mono text-xs text-emerald-600 dark:text-emerald-400">
                        {row.p50 ? formatINR(row.p50) : '—'}
                      </td>
                      <td className="py-2 px-1 text-right text-xs text-muted-foreground">
                        {`${(((row.max - row.min) / row.mid) * 100).toFixed(0)}%`}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          onClick={() => { setSelectedBand(row.band); setActiveTab('editor'); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Range Editor ── */}
      {activeTab === 'editor' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Band Range Editor</h3>
          {bands.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No salary bands configured</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {bands.map((sb: any) => {
                const code = sb.band?.code;
                const isSelected = selectedBand === code;
                const min = Number(sb.minSalary);
                const mid = Number(sb.midSalary);
                const max = Number(sb.maxSalary);
                return (
                  <div
                    key={sb.id}
                    className={cn(
                      'p-4 rounded-xl border-2 cursor-pointer transition-all',
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    )}
                    onClick={() => setSelectedBand(isSelected ? null : code)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', getBandColor(code))}>
                        {code}
                      </span>
                      <span className="text-xs text-muted-foreground">{sb.jobArea?.name || 'All'}</span>
                    </div>
                    <div className="space-y-2.5">
                      {[
                        { label: 'Min', value: min, pct: '0%' },
                        { label: 'Mid', value: mid, pct: `${(((mid - min) / (max - min)) * 100).toFixed(0)}%` },
                        { label: 'Max', value: max, pct: '100%' },
                      ].map(f => (
                        <div key={f.label} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-6 flex-shrink-0">{f.label}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full">
                            <div className="h-full bg-primary/60 rounded-full" style={{ width: f.pct }} />
                          </div>
                          <span className="text-xs font-mono w-20 text-right text-foreground">{formatINR(f.value, true)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── New Band Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">New Salary Band</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
              className="px-6 py-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Band</label>
                <select
                  required
                  value={form.bandId}
                  onChange={(e) => setForm(f => ({ ...f, bandId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select a band…</option>
                  {allBands.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.code} — {b.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(['minSalary', 'midSalary', 'maxSalary'] as const).map((field) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 capitalize">
                      {field === 'minSalary' ? 'Min (₹)' : field === 'midSalary' ? 'Mid (₹)' : 'Max (₹)'}
                    </label>
                    <input
                      required
                      type="number"
                      min={0}
                      step={1000}
                      value={form[field]}
                      onChange={(e) => setForm(f => ({ ...f, [field]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Effective Date</label>
                <input
                  required
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setForm(f => ({ ...f, effectiveDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Band'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Outliers ── */}
      {activeTab === 'outliers' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-foreground">Employees Outside Salary Bands</h3>
          </div>
          {outliersLoading ? (
            <div className="p-5 space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted/40 rounded animate-pulse" />)}
            </div>
          ) : outliers.length === 0 ? (
            <div className="py-16 text-center">
              <TrendingUp className="w-10 h-10 text-green-500/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">All employees are within their salary bands</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Band</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Current Salary</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Band Min</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Band Max</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Delta</th>
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
                      <td className="px-4 py-3 text-right font-mono">{formatINR(Number(emp.annualFixed))}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{formatINR(emp.minSalary)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">{formatINR(emp.maxSalary)}</td>
                      <td className={cn('px-4 py-3 text-right font-mono font-semibold',
                        emp.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'
                      )}>
                        {emp.delta > 0 ? '+' : ''}{formatINR(Math.abs(emp.delta), true)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                          emp.delta < 0
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        )}>
                          {emp.delta < 0 ? 'Below Band' : 'Above Band'}
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
