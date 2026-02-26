import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Calendar, AlertCircle, Sparkles, RefreshCw, X, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

const rsuApi = {
  getGrants: async () => { const r = await api.get('/rsu'); return r.data; },
  getVestingSchedule: async () => { const r = await api.get('/rsu/vesting-schedule'); return r.data; },
  getEligibilityGap: async () => { const r = await api.get('/rsu/eligibility-gap'); return r.data; },
  getSummary: async () => { const r = await api.get('/rsu/summary'); return r.data; },
  getAIAnalysis: async () => { const r = await api.get('/rsu/ai-analysis'); return r.data; },
};

export default function RSUTrackerPage() {
  const [activeTab, setActiveTab] = useState<'grants' | 'vesting' | 'eligibility'>('grants');
  const [showAI, setShowAI] = useState(false);
  const queryClient = useQueryClient();

  const { data: summaryRaw } = useQuery({ queryKey: ['rsu', 'summary'], queryFn: rsuApi.getSummary });
  const { data: grantsRaw, isLoading: grantsLoading } = useQuery({ queryKey: ['rsu', 'grants'], queryFn: rsuApi.getGrants });
  const { data: vestingRaw, isLoading: vestingLoading } = useQuery({ queryKey: ['rsu', 'vesting'], queryFn: rsuApi.getVestingSchedule });
  const { data: eligibilityRaw, isLoading: eligibilityLoading } = useQuery({ queryKey: ['rsu', 'eligibility-gap'], queryFn: rsuApi.getEligibilityGap });
  const { data: aiRaw, isLoading: aiLoading } = useQuery({
    queryKey: ['rsu', 'ai-analysis'],
    queryFn: rsuApi.getAIAnalysis,
    enabled: showAI,
    staleTime: 30 * 60 * 1000,
  });
  const aiNarrative: string = aiRaw?.data?.narrative || '';

  const summary = (summaryRaw?.data || {}) as any;
  const grants = (grantsRaw?.data || []) as any[];
  const vesting = (vestingRaw?.data || []) as any[];
  const eligibilityGap = (eligibilityRaw?.data || []) as any[];

  const tabs = [
    { key: 'grants', label: 'All Grants' },
    { key: 'vesting', label: 'Vesting Schedule' },
    { key: 'eligibility', label: 'Eligibility Gap' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">RSU Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track RSU grants, vesting schedules, and eligibility</p>
        </div>
        <button
          onClick={() => setShowAI(v => !v)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0',
            showAI
              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300'
              : 'bg-purple-600 text-white hover:bg-purple-700'
          )}
        >
          <Sparkles className="w-4 h-4" />
          {showAI ? 'Hide AI Analysis' : 'AI Analysis'}
        </button>
      </div>

      {/* AI Analysis Panel */}
      {showAI && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-900/10 dark:border-purple-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300">CompSense AI — RSU Program Analysis</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  queryClient.removeQueries({ queryKey: ['rsu', 'ai-analysis'] });
                  queryClient.invalidateQueries({ queryKey: ['rsu', 'ai-analysis'] });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-100 dark:border-purple-700 dark:text-purple-300 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
              <button onClick={() => setShowAI(false)} className="p-1.5 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
              <span className="text-sm text-purple-700 dark:text-purple-300">Analyzing RSU program data with Claude AI…</span>
            </div>
          ) : aiNarrative ? (
            <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
              <ReactMarkdown>{aiNarrative}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Click Regenerate to generate a fresh analysis.</p>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Grants', value: summary.totalGrants || 0, icon: TrendingUp, color: 'text-purple-600' },
          { label: 'Total Grant Value', value: `₹${((summary.totalValue || 0) / 100000).toFixed(0)}L`, icon: TrendingUp, color: 'text-blue-600' },
          { label: 'Vested Value', value: `₹${((summary.vestedValue || 0) / 100000).toFixed(0)}L`, icon: TrendingUp, color: 'text-green-600' },
          { label: 'Eligibility Gap', value: eligibilityGap.length, icon: AlertCircle, color: 'text-orange-600' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className={cn('w-4 h-4', kpi.color)} />
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
              'px-4 py-2 rounded-md text-sm font-medium transition-colors',
              activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* All Grants */}
      {activeTab === 'grants' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {grantsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Employee', 'Band', 'Grant Date', 'Total Units', 'Vested', 'Grant Price', 'Current Value', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {grants.map((g: any) => (
                  <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{g.employee.firstName} {g.employee.lastName}</p>
                      <p className="text-xs text-muted-foreground">{g.employee.department}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs">{g.employee.band}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(g.grantDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{g.totalUnits.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="text-green-600 font-medium">{g.vestedUnits.toLocaleString()}</span>
                      <span className="text-muted-foreground text-xs"> / {g.totalUnits.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">₹{g.priceAtGrant.toLocaleString()}</td>
                    <td className="px-4 py-3 font-medium text-foreground">₹{(g.currentValue / 100000).toFixed(1)}L</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-xs',
                        g.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'
                      )}>
                        {g.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!grantsLoading && grants.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No RSU grants found</p>
            </div>
          )}
        </div>
      )}

      {/* Vesting Schedule */}
      {activeTab === 'vesting' && (
        <div className="space-y-4">
          {vestingLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : vesting.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center">
              <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No upcoming vesting events</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    {['Employee', 'Vesting Date', 'Units Vesting', 'Est. Value', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {vesting.map((e: any) => {
                    const daysUntil = Math.floor((new Date(e.vestingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{e.rsuGrant.employee.firstName} {e.rsuGrant.employee.lastName}</p>
                          <p className="text-xs text-muted-foreground">{e.rsuGrant.employee.department}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-foreground">
                            {new Date(e.vestingDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                          <p className={cn('text-xs', daysUntil <= 30 ? 'text-orange-500' : 'text-muted-foreground')}>
                            {daysUntil <= 0 ? 'Due now' : `In ${daysUntil} days`}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{e.unitsVesting.toLocaleString()} units</td>
                        <td className="px-4 py-3 font-medium text-green-600">₹{(e.estimatedValue / 100000).toFixed(1)}L</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs',
                            daysUntil <= 30 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                          )}>
                            {daysUntil <= 30 ? 'Upcoming' : 'Scheduled'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Eligibility Gap */}
      {activeTab === 'eligibility' && (
        <div>
          {eligibilityLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {eligibilityGap.length === 0 ? (
                <div className="rounded-xl border border-border bg-card py-12 text-center">
                  <p className="text-sm text-muted-foreground">All eligible employees have RSU grants</p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-900/20 p-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                        {eligibilityGap.length} eligible employees don&apos;t have RSU grants
                      </p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          {['Employee', 'Band', 'Department', 'Tenure', 'Annual Fixed', 'Suggested Grant'].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {eligibilityGap.map((e: any) => (
                          <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{e.name}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs">{e.band}</span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{e.department}</td>
                            <td className="px-4 py-3 text-muted-foreground">{e.tenureMonths}mo</td>
                            <td className="px-4 py-3 font-medium text-foreground">₹{(e.annualFixed / 100000).toFixed(1)}L</td>
                            <td className="px-4 py-3 font-medium text-green-600">₹{(e.suggestedGrantValue / 100000).toFixed(1)}L</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
