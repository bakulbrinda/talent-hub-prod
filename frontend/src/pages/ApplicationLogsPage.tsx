import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, Database, Mail, Users, Activity,
  ChevronDown, ChevronRight, Loader2, Search, Filter,
  Download, RefreshCw, AlertCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { formatRelativeTime } from '../lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

type LogCategory = 'AUTH' | 'DATA' | 'EMAIL' | 'USER_MGMT' | 'SYSTEM';

interface UnifiedLog {
  id: string;
  source: 'audit' | 'mail';
  category: LogCategory;
  timestamp: string;
  user: { id: string; name: string; email: string; role: string } | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  recipientEmail?: string;
  subject?: string;
  useCase?: string;
}

interface LogStats {
  totalToday: number;
  authToday: number;
  dataToday: number;
  emailToday: number;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<LogCategory, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  AUTH:     { label: 'Auth',     color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20',   icon: ShieldCheck },
  DATA:     { label: 'Data',     color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20', icon: Database },
  EMAIL:    { label: 'Email',    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20', icon: Mail },
  USER_MGMT:{ label: 'Users',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: Users },
  SYSTEM:   { label: 'System',  color: 'text-slate-400',  bg: 'bg-slate-500/10 border-slate-500/20', icon: Activity },
};

const ROLE_BADGES: Record<string, string> = {
  ADMIN:      'bg-red-500/15 text-red-400 border-red-500/20',
  HR_MANAGER: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  HR_STAFF:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  VIEWER:     'bg-slate-500/15 text-slate-400 border-slate-500/20',
};

function formatAction(action: string): string {
  return action.replace(/_/g, ' ');
}

function getInitialsFromName(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── API Fetchers ─────────────────────────────────────────────────────────────

const fetchLogs = async (params: Record<string, string | number>) => {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();
  const r = await api.get(`/app-logs?${qs}`);
  return r.data;
};

const fetchStats = async () => {
  const r = await api.get('/app-logs/stats');
  return r.data.data as LogStats;
};

const fetchUsers = async () => {
  const r = await api.get('/app-logs/users');
  return r.data.data as UserOption[];
};

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, colorClass, isLoading,
}: {
  label: string; value: number; icon: React.ElementType; colorClass: string; isLoading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        {isLoading ? (
          <div className="h-6 w-12 rounded bg-muted/50 animate-pulse mt-0.5" />
        ) : (
          <p className="text-xl font-bold text-foreground">{value.toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}

// ─── Category Badge ───────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: LogCategory }) {
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-semibold', meta.bg, meta.color)}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

// ─── Log Row ──────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: UnifiedLog }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!(log.metadata || log.recipientEmail || log.subject);
  const roleBadge = log.user ? (ROLE_BADGES[log.user.role] || ROLE_BADGES['VIEWER']) : null;

  return (
    <div>
      <button
        onClick={() => hasDetails && setExpanded(e => !e)}
        className={cn(
          'w-full grid gap-3 px-4 py-3 text-left text-sm transition-colors',
          'grid-cols-[140px_180px_80px_1fr_100px_90px]',
          hasDetails ? 'cursor-pointer hover:bg-muted/20' : 'cursor-default',
          expanded && 'bg-muted/10',
        )}
      >
        {/* Timestamp */}
        <div className="flex flex-col justify-center">
          <span className="text-foreground text-xs font-medium">
            {new Date(log.timestamp).toLocaleString('en-IN', {
              day: 'numeric', month: 'short',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
          <span className="text-muted-foreground text-[11px]">{formatRelativeTime(log.timestamp)}</span>
        </div>

        {/* User */}
        <div className="flex items-center gap-2 overflow-hidden">
          {log.user ? (
            <>
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {getInitialsFromName(log.user.name)}
              </div>
              <div className="overflow-hidden">
                <p className="text-foreground text-xs font-medium truncate">{log.user.name}</p>
                <span className={cn('inline-block px-1.5 py-px rounded border text-[10px] font-semibold', roleBadge!)}>
                  {log.user.role.replace('_', ' ')}
                </span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground text-xs italic">System</span>
          )}
        </div>

        {/* Category */}
        <div className="flex items-center">
          <CategoryBadge category={log.category} />
        </div>

        {/* Action */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          {hasDetails && (
            expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
          <div className="overflow-hidden">
            <p className="text-foreground text-xs font-mono font-medium truncate">{formatAction(log.action)}</p>
            {log.entityType && (
              <p className="text-muted-foreground text-[11px] truncate">{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}…` : ''}</p>
            )}
            {log.source === 'mail' && log.subject && (
              <p className="text-muted-foreground text-[11px] truncate">→ {log.recipientEmail}</p>
            )}
          </div>
        </div>

        {/* Use case / entity hint */}
        <div className="flex items-center overflow-hidden">
          {log.useCase ? (
            <span className="text-xs text-muted-foreground truncate">{log.useCase}</span>
          ) : log.entityType ? (
            <span className="text-xs text-muted-foreground truncate">{log.entityType}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          )}
        </div>

        {/* IP */}
        <div className="flex items-center">
          {log.ip ? (
            <span className="text-[11px] font-mono text-muted-foreground">{log.ip}</span>
          ) : (
            <span className="text-muted-foreground/40 text-xs">—</span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="px-4 pb-3 pt-1 bg-muted/5 border-t border-border/50">
          {log.source === 'mail' && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p><span className="font-medium text-foreground">Subject:</span> {log.subject}</p>
              <p><span className="font-medium text-foreground">Recipient:</span> {log.recipientEmail}</p>
              <p><span className="font-medium text-foreground">Use Case:</span> {log.useCase}</p>
            </div>
          )}
          {log.metadata && (
            <pre className="text-[11px] font-mono text-muted-foreground bg-background border border-border rounded-lg p-3 overflow-x-auto max-h-40 mt-1">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApplicationLogsPage() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>('');
  const [userId, setUserId] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const resetFilters = useCallback(() => {
    setCategory('');
    setUserId('');
    setSearch('');
    setSearchInput('');
    setFrom('');
    setTo('');
    setPage(1);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['app-logs-stats'],
    queryFn: fetchStats,
    staleTime: 60_000,
  });

  const { data: usersData } = useQuery({
    queryKey: ['app-logs-users'],
    queryFn: fetchUsers,
    staleTime: 300_000,
  });

  const { data: logsData, isLoading: logsLoading, refetch } = useQuery({
    queryKey: ['app-logs', page, category, userId, search, from, to],
    queryFn: () =>
      fetchLogs({ page, limit: 50, ...(category && { category }), ...(userId && { userId }), ...(search && { search }), ...(from && { from }), ...(to && { to }) }),
    staleTime: 30_000,
  });

  const logs: UnifiedLog[] = logsData?.data || [];
  const meta = logsData?.meta || { total: 0, totalPages: 1 };
  const stats: LogStats = statsData || { totalToday: 0, authToday: 0, dataToday: 0, emailToday: 0 };
  const users: UserOption[] = usersData || [];

  const hasActiveFilters = !!(category || userId || search || from || to);

  const handleExport = async () => {
    const qs = new URLSearchParams({
      limit: '1000',
      ...(category && { category }),
      ...(userId && { userId }),
      ...(search && { search }),
      ...(from && { from }),
      ...(to && { to }),
    }).toString();
    const r = await api.get(`/app-logs?${qs}`);
    const rows: UnifiedLog[] = r.data?.data || [];
    const csv = [
      'Timestamp,User,Role,Category,Action,Entity Type,Entity ID,IP,Details',
      ...rows.map(l =>
        [
          l.timestamp,
          l.user?.name || 'System',
          l.user?.role || '',
          l.category,
          l.action,
          l.entityType || '',
          l.entityId || '',
          l.ip || '',
          JSON.stringify(l.metadata || l.subject || '').replace(/"/g, '""'),
        ]
          .map(v => `"${v}"`)
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `application-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Application Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full audit trail — auth, data changes, emails, and system events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Events Today"   value={stats.totalToday} icon={Activity}    colorClass="bg-primary/10 text-primary"        isLoading={statsLoading} />
        <StatCard label="Auth Events"    value={stats.authToday}  icon={ShieldCheck} colorClass="bg-blue-500/10 text-blue-400"      isLoading={statsLoading} />
        <StatCard label="Data Changes"   value={stats.dataToday}  icon={Database}    colorClass="bg-violet-500/10 text-violet-400"  isLoading={statsLoading} />
        <StatCard label="Emails Sent"    value={stats.emailToday} icon={Mail}        colorClass="bg-amber-500/10 text-amber-400"    isLoading={statsLoading} />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[180px]">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search actions…"
                className="w-full pl-8 pr-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
              Go
            </button>
          </form>

          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Category</label>
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            >
              <option value="">All Categories</option>
              <option value="AUTH">Auth</option>
              <option value="DATA">Data Changes</option>
              <option value="EMAIL">Emails</option>
              <option value="USER_MGMT">User Management</option>
              <option value="SYSTEM">System</option>
            </select>
          </div>

          {/* User */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">User</label>
            <select
              value={userId}
              onChange={e => { setUserId(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground min-w-[160px]"
            >
              <option value="">All Users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Date from */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">From</label>
            <input
              type="date"
              value={from}
              onChange={e => { setFrom(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            />
          </div>

          {/* Date to */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">To</label>
            <input
              type="date"
              value={to}
              onChange={e => { setTo(e.target.value); setPage(1); }}
              className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:text-foreground hover:bg-muted/30 transition-colors self-end"
            >
              <Filter className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Logs table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[140px_180px_80px_1fr_100px_90px] gap-3 px-4 py-2.5 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Timestamp</span>
          <span>User</span>
          <span>Category</span>
          <span>Action / Details</span>
          <span>Entity</span>
          <span>IP</span>
        </div>

        {logsLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading logs…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No log entries found</p>
            {hasActiveFilters && (
              <button onClick={resetFilters} className="text-xs text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map(log => (
              <LogRow key={`${log.source}-${log.id}`} log={log} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta.totalPages >= 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
            <p className="text-xs text-muted-foreground">
              {meta.total.toLocaleString()} event{meta.total !== 1 ? 's' : ''} total
              {hasActiveFilters && <span className="ml-1 text-primary/70">(filtered)</span>}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Page {page} of {meta.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="px-3 py-1.5 rounded-lg text-xs border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
