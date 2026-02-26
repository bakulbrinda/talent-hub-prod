import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, BarChart3, Users, CheckCircle, XCircle, TrendingUp, Upload, Sparkles, RefreshCw, X, FileSpreadsheet, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const benefitsApi = {
  getCatalog: async () => { const r = await api.get('/benefits/catalog'); return r.data; },
  getUtilization: async () => { const r = await api.get('/benefits/utilization'); return r.data; },
  getEnrollments: async () => { const r = await api.get('/benefits/enrollments'); return r.data; },
  getCategorySummary: async () => { const r = await api.get('/benefits/category-summary'); return r.data; },
  getAIAnalysis: async () => { const r = await api.get('/benefits/ai-analysis'); return r.data; },
  importData: async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    const r = await api.post('/benefits/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return r.data;
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  INSURANCE: 'bg-blue-100 text-blue-700',
  EQUITY: 'bg-purple-100 text-purple-700',
  LEARNING: 'bg-green-100 text-green-700',
  LEAVE: 'bg-yellow-100 text-yellow-700',
  RECOGNITION: 'bg-orange-100 text-orange-700',
  WELLNESS: 'bg-pink-100 text-pink-700',
};

const CATEGORY_ICONS: Record<string, string> = {
  INSURANCE: '🏥',
  EQUITY: '📈',
  LEARNING: '📚',
  LEAVE: '🌴',
  RECOGNITION: '🏆',
  WELLNESS: '💪',
};

export default function BenefitsManagementPage() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'utilization' | 'enrollments'>('catalog');
  const [showImport, setShowImport] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: catalogRaw, isLoading: catalogLoading } = useQuery({
    queryKey: ['benefits', 'catalog'],
    queryFn: benefitsApi.getCatalog,
  });

  const { data: utilizationRaw, isLoading: utilLoading } = useQuery({
    queryKey: ['benefits', 'utilization'],
    queryFn: benefitsApi.getUtilization,
  });

  const { data: enrollmentsRaw, isLoading: enrollLoading } = useQuery({
    queryKey: ['benefits', 'enrollments'],
    queryFn: benefitsApi.getEnrollments,
  });

  const { data: aiRaw, isLoading: aiLoading, refetch: refetchAI } = useQuery({
    queryKey: ['benefits', 'ai-analysis'],
    queryFn: benefitsApi.getAIAnalysis,
    enabled: showAI,
    staleTime: 1800000,
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => benefitsApi.importData(file),
    onSuccess: (data) => {
      setImportResult(data?.data || data);
      queryClient.invalidateQueries({ queryKey: ['benefits', 'utilization'] });
      queryClient.invalidateQueries({ queryKey: ['benefits', 'enrollments'] });
      queryClient.removeQueries({ queryKey: ['benefits', 'ai-analysis'] });
      setImportFile(null);
    },
  });

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setImportFile(f);
  };

  const catalog = (catalogRaw?.data || []) as any[];
  const utilization = (utilizationRaw?.data || []) as any[];
  const enrollments = (enrollmentsRaw?.data || []) as any[];
  const aiNarrative = (aiRaw?.data?.narrative || '') as string;

  // Group catalog by category
  const byCategory = catalog.reduce((acc: Record<string, any[]>, b: any) => {
    if (!acc[b.category]) acc[b.category] = [];
    acc[b.category].push(b);
    return acc;
  }, {});

  const tabs = [
    { key: 'catalog', label: 'Benefits Catalog', icon: Gift },
    { key: 'utilization', label: 'Utilization Analytics', icon: BarChart3 },
    { key: 'enrollments', label: 'Enrollment Management', icon: Users },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Benefits Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage employee benefits catalog, enrollment, and utilization</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAI(!showAI); }}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              showAI ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
            )}
          >
            <Sparkles className="w-4 h-4" />
            AI Analysis
          </button>
          <button
            onClick={() => { setShowImport(!showImport); setImportResult(null); }}
            className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              showImport ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'
            )}
          >
            <Upload className="w-4 h-4" />
            Upload Utilization Data
          </button>
        </div>
      </div>

      {/* AI Analysis Panel */}
      {showAI && (
        <div className="rounded-xl border border-primary/30 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">AI Benefits Analysis</span>
              <span className="text-xs text-muted-foreground">Powered by Claude</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { queryClient.removeQueries({ queryKey: ['benefits', 'ai-analysis'] }); refetchAI(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Regenerate
              </button>
              <button onClick={() => setShowAI(false)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="p-5 max-h-96 overflow-y-auto">
            {aiLoading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-primary/30 animate-spin border-t-primary" />
                  <Sparkles className="w-4 h-4 text-primary absolute inset-0 m-auto" />
                </div>
                <p className="text-sm text-muted-foreground">Claude is analyzing your benefits data...</p>
              </div>
            ) : aiNarrative ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-base font-bold text-foreground mt-3 mb-2">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-sm font-semibold text-foreground mt-3 mb-1.5">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h3>,
                    p: ({ children }) => <p className="text-sm text-foreground leading-relaxed mb-2">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2">{children}</ol>,
                    li: ({ children }) => <li className="text-sm text-foreground">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                  }}
                >
                  {aiNarrative}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-8">
                <Sparkles className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Click Regenerate to generate a fresh AI analysis</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Utilization Data Panel */}
      {showImport && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Upload Utilization Data</span>
            </div>
            <button onClick={() => { setShowImport(false); setImportResult(null); setImportFile(null); }} className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>Upload a CSV or Excel file. The template below comes pre-filled with all available benefit names.</p>
                  <p><span className="font-medium text-foreground">Employee ID</span> — use your employee code (e.g. EMP001) or email address.</p>
                  <p><span className="font-medium text-foreground">Utilization %</span> — how much of the benefit was used (0–100).</p>
                  <p><span className="font-medium text-foreground">Utilized Value</span> — actual amount spent in ₹ (e.g. 1360000 for ₹13.6L). Leave 0 if unknown.</p>
                </div>
                <button
                  onClick={() => {
                    const benefitNames = catalog.length > 0
                      ? catalog.map((b: any) => b.name)
                      : ['Comprehensive Medical Insurance', 'Parental Medical Insurance', 'Mental Health on Loop', 'Training & Learning Allowance', 'Annual Company Offsite'];
                    const headers = 'Employee ID,Benefit Name,Utilization %,Utilized Value';
                    const sample1 = benefitNames.map((name: string) => `EMP001,${name},0,0`);
                    const sample2 = benefitNames.map((name: string) => `EMP002,${name},0,0`);
                    const csv = [headers, ...sample1, ...sample2].join('\n');
                    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                    const a = document.createElement('a');
                    a.href = url; a.download = 'benefits_utilization_template.csv'; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Download Template
                </button>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30',
                importFile ? 'border-green-400 bg-green-50 dark:bg-green-900/10' : ''
              )}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImportFile(f); }} />
              {importFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">{importFile.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setImportFile(null); }} className="text-muted-foreground hover:text-foreground ml-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Drop your CSV / Excel file here or click to browse</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Max 5MB · .csv, .xlsx, .xls</p>
                </>
              )}
            </div>

            {importFile && !importResult && (
              <button
                onClick={() => importMutation.mutate(importFile)}
                disabled={importMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {importMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Processing...</> : <><Upload className="w-4 h-4" />Import Utilization Data</>}
              </button>
            )}

            {importResult && (
              <div className={cn('rounded-lg p-4 text-sm', importResult.failed === 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800')}>
                <p className="font-medium text-foreground">Import Complete</p>
                <p className="text-muted-foreground mt-1">{importResult.updated} records updated · {importResult.failed} failed</p>
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 space-y-0.5 max-h-24 overflow-y-auto">
                    {importResult.errors.slice(0, 5).map((e: string, i: number) => (
                      <p key={i} className="text-xs text-red-600 dark:text-red-400">{e}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Benefits', value: catalog.length, icon: '🎁', color: 'text-blue-600' },
          { label: 'Total Enrollments', value: enrollments.length, icon: '👥', color: 'text-green-600' },
          { label: 'Avg Utilization', value: `${Math.round(utilization.reduce((s: number, u: any) => s + u.avgUtilization, 0) / Math.max(utilization.length, 1))}%`, icon: '📊', color: 'text-purple-600' },
          { label: 'Categories', value: Object.keys(byCategory).length, icon: '🏷️', color: 'text-orange-600' },
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
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Catalog Tab */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {catalogLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            Object.entries(byCategory).map(([category, benefits]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{CATEGORY_ICONS[category] || '📋'}</span>
                  <h3 className="text-sm font-semibold text-foreground">{category}</h3>
                  <span className="px-2 py-0.5 rounded-full bg-muted text-xs text-muted-foreground">{benefits.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {benefits.map((benefit: any) => (
                    <div key={benefit.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{benefit.name}</h4>
                          <span className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium', CATEGORY_COLORS[category] || 'bg-muted text-muted-foreground')}>
                            {category}
                          </span>
                        </div>
                        {benefit.isActive ? (
                          <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                      {benefit.annualValue > 0 && (
                        <p className="text-lg font-bold text-foreground">
                          {benefit.annualValue >= 100000
                            ? `₹${(benefit.annualValue / 100000).toFixed(0)}L/yr`
                            : `₹${(benefit.annualValue / 1000).toFixed(0)}K/yr`}
                        </p>
                      )}
                      {benefit.eligibilityCriteria && Object.keys(benefit.eligibilityCriteria).length > 0 && (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {benefit.eligibilityCriteria.minBand && <p>Min Band: {benefit.eligibilityCriteria.minBand}</p>}
                          {benefit.eligibilityCriteria.minTenure && <p>Min Tenure: {benefit.eligibilityCriteria.minTenure}mo</p>}
                          {benefit.eligibilityCriteria.minRating && <p>Min Rating: {benefit.eligibilityCriteria.minRating}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Utilization Tab */}
      {activeTab === 'utilization' && (
        <div className="space-y-4">
          {utilLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {utilization.map((u: any) => (
                <div key={u.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{u.name}</h4>
                      <p className="text-xs text-muted-foreground">{u.enrolledCount} enrolled employees</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">{u.avgUtilization}%</p>
                      <p className="text-xs text-muted-foreground">avg utilization</p>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        u.avgUtilization >= 70 ? 'bg-green-500' : u.avgUtilization >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      )}
                      style={{ width: `${u.avgUtilization}%` }}
                    />
                  </div>
                  {u.totalUtilized > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      ₹{(u.totalUtilized / 100000).toFixed(1)}L total utilized
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enrollments Tab */}
      {activeTab === 'enrollments' && (
        <div>
          {enrollLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Benefit</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Category</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Utilization</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {enrollments.slice(0, 50).map((e: any) => (
                    <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{e.employee.firstName} {e.employee.lastName}</p>
                        <p className="text-xs text-muted-foreground">{e.employee.department} · {e.employee.band}</p>
                      </td>
                      <td className="px-4 py-3 text-foreground">{e.benefit.name}</td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', CATEGORY_COLORS[e.benefit.category] || 'bg-muted text-muted-foreground')}>
                          {e.benefit.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          'font-medium',
                          e.utilizationPercent >= 70 ? 'text-green-600' : e.utilizationPercent >= 40 ? 'text-yellow-600' : 'text-red-600'
                        )}>
                          {e.utilizationPercent}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs', e.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground')}>
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {enrollments.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">No enrollments found</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
