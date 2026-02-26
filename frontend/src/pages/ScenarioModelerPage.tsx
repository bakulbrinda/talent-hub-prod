import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, CheckCircle, Trash2, BarChart3, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const scenarioApi = {
  getAll: async () => { const r = await api.get('/scenarios'); return r.data; },
  create: async (data: any) => { const r = await api.post('/scenarios', data); return r.data; },
  run: async (id: string) => { const r = await api.post(`/scenarios/${id}/run`); return r.data; },
  apply: async (id: string) => { const r = await api.post(`/scenarios/${id}/apply`, { confirmationToken: 'CONFIRM_APPLY' }); return r.data; },
  delete: async (id: string) => { const r = await api.delete(`/scenarios/${id}`); return r.data; },
  analyzeRun: async (runResult: any) => { const r = await api.post('/scenarios/analyze-run', runResult); return r.data; },
};

const BAND_OPTIONS = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
const DEPT_OPTIONS = ['Engineering', 'Sales', 'Operations', 'HR', 'Finance', 'Product'];
const ACTION_TYPES = [
  { value: 'RAISE_PERCENT', label: '% Raise' },
  { value: 'RAISE_FLAT', label: 'Flat Raise (₹)' },
  { value: 'SET_TO_BENCHMARK', label: 'Set to Band Midpoint' },
  { value: 'SET_COMPA_RATIO', label: 'Set Compa-Ratio %' },
];

function emptyRule() {
  return { filter: { band: [] as string[], department: [] as string[] }, action: { type: 'RAISE_PERCENT', value: 10 } };
}

export default function ScenarioModelerPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [aiNarrative, setAiNarrative] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [newScenario, setNewScenario] = useState({ name: '', description: '', rules: [emptyRule()] });
  const [isCreating, setIsCreating] = useState(false);

  const { data: scenariosRaw, isLoading } = useQuery({ queryKey: ['scenarios'], queryFn: scenarioApi.getAll });
  const scenarios = (scenariosRaw?.data || []) as any[];
  const selected = scenarios.find(s => s.id === selectedId);

  const createMutation = useMutation({
    mutationFn: scenarioApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setSelectedId(data.data?.id);
      setIsCreating(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: scenarioApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setSelectedId(null);
      setRunResult(null);
      setAiNarrative('');
    },
  });

  const handleRun = async () => {
    if (!selectedId) return;
    setRunning(true);
    setRunResult(null);
    setAiNarrative('');
    try {
      const result = await scenarioApi.run(selectedId);
      setRunResult(result.data);
      // Auto-trigger AI analysis on run result
      if (result.data) {
        setAiLoading(true);
        try {
          const aiResult = await scenarioApi.analyzeRun(result.data);
          setAiNarrative(aiResult.data?.narrative || '');
        } catch { /* fallback silently */ }
        finally { setAiLoading(false); }
      }
    } finally {
      setRunning(false);
    }
  };

  const handleReanalyze = async () => {
    if (!runResult) return;
    setAiNarrative('');
    setAiLoading(true);
    try {
      const aiResult = await scenarioApi.analyzeRun(runResult);
      setAiNarrative(aiResult.data?.narrative || '');
    } catch { /* fallback */ }
    finally { setAiLoading(false); }
  };

  const handleApply = async () => {
    if (!selectedId) return;
    setApplying(true);
    try {
      await scenarioApi.apply(selectedId);
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      setShowApplyConfirm(false);
      setRunResult(null);
    } finally {
      setApplying(false);
    }
  };

  const updateRule = (index: number, field: string, value: any) => {
    setNewScenario(prev => {
      const rules = [...prev.rules];
      const keys = field.split('.');
      if (keys.length === 2) {
        rules[index] = { ...rules[index], [keys[0]]: { ...(rules[index] as any)[keys[0]], [keys[1]]: value } };
      }
      return { ...prev, rules };
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Scenario Modeler</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Model compensation changes with what-if scenario analysis</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Scenario List */}
        <div className="space-y-3">
          <button
            onClick={() => { setIsCreating(true); setSelectedId(null); setRunResult(null); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Scenario
          </button>

          {isLoading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {scenarios.map((s: any) => (
                <div
                  key={s.id}
                  onClick={() => { setSelectedId(s.id); setIsCreating(false); setRunResult(null); setAiNarrative(''); }}
                  className={cn(
                    'rounded-xl border p-3 cursor-pointer transition-all',
                    selectedId === s.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-card'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                      {s.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.description}</p>}
                    </div>
                    <span className={cn('px-1.5 py-0.5 rounded text-xs flex-shrink-0',
                      s.status === 'APPLIED' ? 'bg-green-100 text-green-700' :
                      s.status === 'DRAFT' ? 'bg-muted text-muted-foreground' : 'bg-blue-100 text-blue-700'
                    )}>
                      {s.status}
                    </span>
                  </div>
                  {s.rules && (
                    <p className="text-xs text-muted-foreground mt-1">{Array.isArray(s.rules) ? s.rules.length : 0} rule(s)</p>
                  )}
                </div>
              ))}
              {scenarios.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-4">No scenarios yet. Create one to get started.</p>
              )}
            </div>
          )}
        </div>

        {/* Right: Scenario Builder or Results */}
        <div className="lg:col-span-2 space-y-4">
          {/* Create form */}
          {isCreating && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">New Scenario</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    value={newScenario.name}
                    onChange={e => setNewScenario(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. 10% raise for P2 engineers"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                  <input
                    value={newScenario.description}
                    onChange={e => setNewScenario(p => ({ ...p, description: e.target.value }))}
                    placeholder="Brief description"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-muted-foreground">Rules</label>
                    <button
                      onClick={() => setNewScenario(p => ({ ...p, rules: [...p.rules, emptyRule()] }))}
                      className="text-xs text-primary hover:text-primary/80"
                    >+ Add Rule</button>
                  </div>
                  {newScenario.rules.map((rule, i) => (
                    <div key={i} className="rounded-lg border border-border p-3 space-y-3 mb-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Band Filter</label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {BAND_OPTIONS.map(b => (
                              <button
                                key={b}
                                onClick={() => {
                                  const current = (rule.filter.band || []) as string[];
                                  updateRule(i, 'filter.band', current.includes(b) ? current.filter(x => x !== b) : [...current, b]);
                                }}
                                className={cn('px-2 py-0.5 rounded text-xs transition-colors',
                                  ((rule.filter.band || []) as string[]).includes(b)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                )}
                              >{b}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Department Filter</label>
                          <select
                            value={(rule.filter.department as string[])[0] || ''}
                            onChange={e => updateRule(i, 'filter.department', e.target.value ? [e.target.value] : [])}
                            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
                          >
                            <option value="">All Departments</option>
                            {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground">Action Type</label>
                          <select
                            value={rule.action.type}
                            onChange={e => updateRule(i, 'action.type', e.target.value)}
                            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
                          >
                            {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Value {rule.action.type === 'RAISE_PERCENT' ? '(%)' : rule.action.type === 'RAISE_FLAT' ? '(₹)' : ''}
                          </label>
                          <input
                            type="number"
                            value={rule.action.value}
                            onChange={e => updateRule(i, 'action.value', Number(e.target.value))}
                            className="mt-1 w-full px-2 py-1.5 rounded-lg border border-border bg-background text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => createMutation.mutate(newScenario)}
                  disabled={!newScenario.name || createMutation.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {createMutation.isPending ? 'Saving...' : 'Save Scenario'}
                </button>
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Selected scenario details */}
          {selected && !isCreating && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{selected.name}</h3>
                  {selected.description && <p className="text-xs text-muted-foreground mt-0.5">{selected.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRun}
                    disabled={running || selected.status === 'APPLIED'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {running ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Play className="w-3 h-3" />}
                    Run Simulation
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(selected.id)}
                    className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Rules summary */}
              {Array.isArray(selected.rules) && selected.rules.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Rules ({selected.rules.length})</p>
                  {selected.rules.map((rule: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-muted/50">
                      <span className="text-muted-foreground">
                        {rule.filter.band?.length > 0 ? `Band ${rule.filter.band.join(', ')}` : 'All bands'}
                        {rule.filter.department?.length > 0 ? ` · ${rule.filter.department.join(', ')}` : ''}
                      </span>
                      <span className="text-foreground font-medium mx-1">→</span>
                      <span className="text-primary font-medium">
                        {rule.action.type === 'RAISE_PERCENT' ? `+${rule.action.value}%` :
                         rule.action.type === 'RAISE_FLAT' ? `+₹${(rule.action.value/1000).toFixed(0)}K` :
                         rule.action.type === 'SET_COMPA_RATIO' ? `Compa-ratio → ${rule.action.value}%` :
                         'Set to benchmark'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Run Results */}
          {runResult && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Simulation Results</h3>
                {!showApplyConfirm ? (
                  <button
                    onClick={() => setShowApplyConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Apply Changes
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Confirm apply?</span>
                    <button onClick={handleApply} disabled={applying} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {applying ? 'Applying...' : 'Yes, Apply'}
                    </button>
                    <button onClick={() => setShowApplyConfirm(false)} className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Affected Employees', value: runResult.affectedCount, color: 'text-blue-600' },
                  { label: 'Current Cost', value: `₹${(runResult.currentCost / 10000000).toFixed(1)}Cr`, color: 'text-foreground' },
                  { label: 'Projected Cost', value: `₹${(runResult.projectedCost / 10000000).toFixed(1)}Cr`, color: 'text-foreground' },
                  { label: 'Delta', value: `+₹${(runResult.delta / 100000).toFixed(0)}L (${runResult.deltaPercent.toFixed(1)}%)`, color: 'text-green-600' },
                ].map(item => (
                  <div key={item.label} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                    <p className={cn('text-sm font-bold', item.color)}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* By Band breakdown */}
              {runResult.byBand?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Cost Delta by Band</p>
                  <div className="space-y-2">
                    {runResult.byBand.map((b: any) => (
                      <div key={b.band} className="flex items-center gap-3 text-sm">
                        <span className="w-8 text-xs font-medium text-foreground">{b.band}</span>
                        <span className="text-muted-foreground text-xs">{b.count} employees</span>
                        <span className="ml-auto text-green-600 font-medium text-xs">+₹{(b.delta / 100000).toFixed(1)}L</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top changes */}
              {runResult.topChanges?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Top Changes</p>
                  <div className="space-y-1">
                    {runResult.topChanges.slice(0, 5).map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 text-xs px-2 py-1.5 rounded-lg hover:bg-muted/30">
                        <span className="font-medium text-foreground flex-1">{e.name}</span>
                        <span className="text-muted-foreground">{e.band}</span>
                        <span className="text-muted-foreground">₹{(e.currentFixed/100000).toFixed(1)}L</span>
                        <span className="text-primary">→</span>
                        <span className="text-green-600 font-medium">₹{(e.projectedFixed/100000).toFixed(1)}L</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Commentary Panel — appears automatically after every simulation */}
          {(aiLoading || aiNarrative) && (
            <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300">CompSense AI — Scenario Recommendation</h3>
                </div>
                <button
                  onClick={handleReanalyze}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3 h-3', aiLoading && 'animate-spin')} />
                  Regenerate
                </button>
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-3 py-4 justify-center">
                  <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                  <span className="text-sm text-purple-700 dark:text-purple-300">Claude is analyzing your scenario…</span>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                  <ReactMarkdown>{aiNarrative}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {!selected && !isCreating && !runResult && (
            <div className="rounded-xl border border-border bg-card py-16 flex flex-col items-center justify-center text-center">
              <BarChart3 className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground">Select a Scenario</p>
              <p className="text-xs text-muted-foreground mt-1">Choose an existing scenario or create a new one to model compensation changes</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
