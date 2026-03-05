import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, TrendingUp, AlertTriangle, Edit2, X, Sparkles, Loader2, ArrowUp, ArrowDown, Minus, Trash2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { salaryBandService } from '../services/salaryBand.service';
import { api } from '../lib/api';
import { queryKeys, STALE_TIMES } from '../lib/queryClient';
import { cn, formatINR, getBandColor } from '../lib/utils';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { BAND_ORDER } from '../../../shared/constants';

const TABS = [
  { id: 'chart', label: 'Band Chart' },
  { id: 'editor', label: 'Range Editor' },
  { id: 'outliers', label: 'Outliers' },
  { id: 'ai', label: 'AI Recommendations' },
] as const;
type TabId = typeof TABS[number]['id'];


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

const EMPTY_FORM = { bandId: '', jobAreaId: '', minSalary: '', midSalary: '', maxSalary: '', effectiveDate: new Date().toISOString().slice(0, 10) };

export default function SalaryBandDesignerPage() {
  const [activeTab, setActiveTab] = useState<TabId>('chart');
  const [selectedBand, setSelectedBand] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [aiBandSuggestions, setAiBandSuggestions] = useState<any[]>([]);
  const [aiBandLoading, setAiBandLoading] = useState(false);

  const qc = useQueryClient();

  const fetchBandSuggestions = async () => {
    setAiBandLoading(true);
    setAiBandSuggestions([]);
    setActiveTab('ai');
    try {
      const res = await api.post('/ai/chat/band-suggestions', {});
      setAiBandSuggestions(res.data.data || []);
    } catch {
      toast.error('Failed to get AI band recommendations');
    } finally {
      setAiBandLoading(false);
    }
  };

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

  const { data: jobAreasRaw } = useQuery({
    queryKey: ['job-areas'],
    queryFn: async () => { const r = await api.get('/job-areas'); return r.data; },
    staleTime: STALE_TIMES.LONG,
  });
  const jobAreas: any[] = (jobAreasRaw as any)?.data ?? (Array.isArray(jobAreasRaw) ? jobAreasRaw : []);

  const createMutation = useMutation({
    mutationFn: () => salaryBandService.create({
      bandId: form.bandId,
      ...(form.jobAreaId ? { jobAreaId: form.jobAreaId } : {}),
      minSalary: Number(form.minSalary),
      midSalary: Number(form.midSalary),
      maxSalary: Number(form.maxSalary),
      effectiveDate: new Date(form.effectiveDate),
    }),
    onSuccess: () => {
      toast.success('Salary band range created');
      qc.invalidateQueries({ queryKey: queryKeys.salaryBands.all() });
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
  });

  // Edit range
  const [editingRange, setEditingRange] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ minSalary: '', midSalary: '', maxSalary: '', effectiveDate: '' });

  const updateMutation = useMutation({
    mutationFn: () => salaryBandService.update(editingRange!.id, {
      minSalary: Number(editForm.minSalary),
      midSalary: Number(editForm.midSalary),
      maxSalary: Number(editForm.maxSalary),
      effectiveDate: new Date(editForm.effectiveDate),
    }),
    onSuccess: () => {
      toast.success('Band range updated');
      qc.invalidateQueries({ queryKey: queryKeys.salaryBands.all() });
      setEditingRange(null);
    },
    onError: () => toast.error('Failed to update range'),
  });

  // Delete range
  const [deletingRange, setDeletingRange] = useState<any | null>(null);
  const deleteRangeMutation = useMutation({
    mutationFn: () => salaryBandService.deleteSalaryBand(deletingRange!.id),
    onSuccess: () => {
      toast.success('Range deleted');
      qc.invalidateQueries({ queryKey: queryKeys.salaryBands.all() });
      setDeletingRange(null);
    },
    onError: () => toast.error('Failed to delete range'),
  });

  // Delete band tier
  const [deletingTier, setDeletingTier] = useState<any | null>(null);
  const deleteTierMutation = useMutation({
    mutationFn: () => api.delete(`/bands/${deletingTier!.id}`),
    onSuccess: () => {
      toast.success(`Band ${deletingTier!.code} deleted`);
      qc.invalidateQueries({ queryKey: queryKeys.salaryBands.all() });
      qc.invalidateQueries({ queryKey: queryKeys.jobArchitecture.bands });
      setDeletingTier(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || 'Failed to delete band';
      toast.error(msg);
      setDeletingTier(null);
    },
  });

  // Collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (code: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });

  const bands: any[] = (bandsRaw as any)?.data ?? (Array.isArray(bandsRaw) ? bandsRaw : []);

  // Group SalaryBand records by band code, preserving BAND_ORDER
  const groupedBands = BAND_ORDER
    .map(code => {
      const ranges = bands.filter((sb: any) => sb.band?.code === code);
      if (ranges.length === 0) return null;
      return { code, band: ranges[0].band, ranges };
    })
    .filter(Boolean) as Array<{ code: string; band: any; ranges: any[] }>;

  // Custom tiers not in BAND_ORDER
  const standardCodes = new Set(BAND_ORDER);
  const customGroups = bands
    .filter((sb: any) => sb.band?.code && !standardCodes.has(sb.band.code))
    .reduce((acc: any, sb: any) => {
      const code = sb.band.code;
      if (!acc[code]) acc[code] = { code, band: sb.band, ranges: [] };
      acc[code].ranges.push(sb);
      return acc;
    }, {});
  const allGroups = [...groupedBands, ...Object.values(customGroups)] as Array<{ code: string; band: any; ranges: any[] }>;

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

  const chartData = BAND_ORDER.filter(c => bandMap.has(c)).map(c => bandMap.get(c)!);

  const formatYAxis = (val: number) => `₹${(val / 100000).toFixed(0)}L`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Salary Band Designer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Design and visualize your organisation's compensation ranges
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBandSuggestions}
            disabled={aiBandLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {aiBandLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            AI Recommendations
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Band
          </button>
        </div>
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
        <div className="space-y-3">
          {bands.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground text-sm">
              No salary bands configured
            </div>
          ) : (
            allGroups.map(({ code, band, ranges }) => {
              const isCollapsed = collapsedGroups.has(code);
              return (
                <div key={code} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-muted/20 transition-colors select-none"
                    onClick={() => toggleGroup(code)}
                  >
                    <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0', getBandColor(code))}>
                      {code}
                    </span>
                    <span className="text-sm font-medium text-foreground">{band?.label || code}</span>
                    <span className="text-xs text-muted-foreground">· {ranges.length} {ranges.length === 1 ? 'range' : 'ranges'}</span>
                    <div className="flex-1" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm({ ...EMPTY_FORM, bandId: band.id });
                        setShowModal(true);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add Range
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingTier(band); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title={`Delete ${code} tier`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 px-5 pb-4">
                      {ranges.map((sb: any) => {
                        const min = Number(sb.minSalary);
                        const mid = Number(sb.midSalary);
                        const max = Number(sb.maxSalary);
                        const deptLabel = sb.jobArea?.name || 'All Departments';
                        return (
                          <div key={sb.id} className="p-3 rounded-xl border border-border hover:border-primary/40 transition-all bg-background">
                            <div className="flex items-center justify-between mb-2.5">
                              <span className="text-xs font-medium text-foreground truncate">{deptLabel}</span>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingRange(sb);
                                    setEditForm({
                                      minSalary: String(min),
                                      midSalary: String(mid),
                                      maxSalary: String(max),
                                      effectiveDate: sb.effectiveDate
                                        ? new Date(sb.effectiveDate).toISOString().slice(0, 10)
                                        : new Date().toISOString().slice(0, 10),
                                    });
                                  }}
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit range"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setDeletingRange(sb)}
                                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-500 transition-colors"
                                  title="Delete range"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {[
                                { label: 'Min', value: min, pct: '0%' },
                                { label: 'Mid', value: mid, pct: max > min ? `${(((mid - min) / (max - min)) * 100).toFixed(0)}%` : '50%' },
                                { label: 'Max', value: max, pct: '100%' },
                              ].map(f => (
                                <div key={f.label} className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground w-5 flex-shrink-0">{f.label}</span>
                                  <div className="flex-1 h-1 bg-muted rounded-full">
                                    <div className="h-full bg-primary/60 rounded-full" style={{ width: f.pct }} />
                                  </div>
                                  <span className="text-[10px] font-mono w-16 text-right text-foreground">{formatINR(f.value, true)}</span>
                                </div>
                              ))}
                            </div>
                            {sb.effectiveDate && (
                              <p className="text-[9px] text-muted-foreground mt-1.5">
                                Effective {new Date(sb.effectiveDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── AI Band Recommendations ── */}
      {activeTab === 'ai' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">AI Band Adjustment Recommendations</h3>
          </div>
          {aiBandLoading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 className="w-7 h-7 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Analyzing compa-ratio distribution across all bands…</p>
            </div>
          ) : aiBandSuggestions.length === 0 ? (
            <div className="py-16 flex flex-col items-center text-center gap-3">
              <Sparkles className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-sm font-medium text-foreground">Get AI-driven band adjustment recommendations</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Claude analyzes your current compa-ratio distribution and suggests whether each band's min/mid/max should be adjusted.
              </p>
              <button
                onClick={fetchBandSuggestions}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors mt-2"
              >
                <Sparkles className="w-4 h-4" />
                Analyze Bands
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {aiBandSuggestions.map((s: any) => {
                const directionIcon = s.direction === 'increase' ? (
                  <ArrowUp className="w-3.5 h-3.5 text-green-600" />
                ) : s.direction === 'decrease' ? (
                  <ArrowDown className="w-3.5 h-3.5 text-red-600" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                );
                const urgencyColor = s.urgency === 'high'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : s.urgency === 'medium'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground';

                return (
                  <div
                    key={s.band}
                    className={cn(
                      'rounded-xl border-2 p-4 space-y-3',
                      s.direction === 'maintain' ? 'border-border' : 'border-primary/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', getBandColor(s.band))}>
                        {s.band}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {directionIcon}
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium capitalize', urgencyColor)}>
                          {s.urgency}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Current Mid</span>
                        <span className="font-mono font-semibold text-foreground">₹{s.currentMidLakhs?.toFixed(1)}L</span>
                      </div>
                      {s.direction !== 'maintain' && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Suggested Mid</span>
                          <span className={cn('font-mono font-semibold',
                            s.direction === 'increase' ? 'text-green-600' : 'text-red-600'
                          )}>
                            ₹{s.suggestedMidLakhs?.toFixed(1)}L
                          </span>
                        </div>
                      )}
                      {s.impactEmployees > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Impact</span>
                          <span className="text-foreground">{s.impactEmployees} employees</span>
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-2">
                      {s.reasoning}
                    </p>
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
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Department (optional)</label>
                <select
                  value={form.jobAreaId}
                  onChange={(e) => setForm(f => ({ ...f, jobAreaId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">All Departments</option>
                  {jobAreas.map((ja: any) => (
                    <option key={ja.id} value={ja.id}>{ja.name}</option>
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

      {/* Edit Range Modal */}
      {editingRange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-base font-semibold text-foreground">Edit Salary Range</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {editingRange.band?.code} · {editingRange.jobArea?.name || 'All Departments'}
                </p>
              </div>
              <button onClick={() => setEditingRange(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }}
              className="px-6 py-5 space-y-4"
            >
              <div className="grid grid-cols-3 gap-3">
                {(['minSalary', 'midSalary', 'maxSalary'] as const).map(field => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      {field === 'minSalary' ? 'Min (₹)' : field === 'midSalary' ? 'Mid (₹)' : 'Max (₹)'}
                    </label>
                    <input
                      required type="number" min={0} step={1000}
                      value={editForm[field]}
                      onChange={(e) => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Effective Date</label>
                <input
                  required type="date"
                  value={editForm.effectiveDate}
                  onChange={(e) => setEditForm(f => ({ ...f, effectiveDate: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEditingRange(null)}
                  className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={updateMutation.isPending}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Range Confirmation */}
      {deletingRange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Delete Range?</h2>
            <p className="text-sm text-muted-foreground">
              Remove <strong>{deletingRange.band?.code} · {deletingRange.jobArea?.name || 'All Departments'}</strong> salary range?
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingRange(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteRangeMutation.mutate()} disabled={deleteRangeMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                {deleteRangeMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tier Confirmation */}
      {deletingTier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">Delete Band Tier?</h2>
            <p className="text-sm text-muted-foreground">
              Delete the entire <strong>{deletingTier.code}</strong> band tier and all its salary ranges?
              This is blocked if any employees are assigned to this band.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingTier(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteTierMutation.mutate()} disabled={deleteTierMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                {deleteTierMutation.isPending ? 'Deleting…' : 'Delete Tier'}
              </button>
            </div>
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
