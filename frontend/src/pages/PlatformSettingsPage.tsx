import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Database, Bell, Key, RefreshCw, CheckCircle, XCircle, Mail, Users, UserPlus, Copy, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

type Tab = 'general' | 'api' | 'data' | 'notifications' | 'email' | 'users';

export default function PlatformSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [testing, setTesting] = useState(false);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [exportLoading, setExportLoading] = useState('');
  const [emailSending, setEmailSending] = useState<string>('');

  // Users tab state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'HR_MANAGER' | 'VIEWER' | 'ADMIN'>('HR_MANAGER');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const qc = useQueryClient();
  const { user: me } = useAuthStore();

  const handleSendEmail = async (endpoint: string, label: string) => {
    setEmailSending(endpoint);
    try {
      const r = await api.post(`/email/${endpoint}`);
      const d = r.data.data;
      if (d.sent > 0) {
        toast.success(`${label} sent`, { description: `${d.sent} email(s) dispatched` });
      } else {
        toast.info('No emails sent', { description: 'SMTP not configured or no matching records found' });
      }
    } catch {
      toast.error(`Failed to send ${label}`);
    } finally {
      setEmailSending('');
    }
  };

  const { data: healthRaw } = useQuery({
    queryKey: ['health'],
    queryFn: async () => { const r = await api.get('/health'); return r.data; },
    retry: false,
  });

  const testClaudeApi = async () => {
    setTesting(true);
    try {
      await api.get('/ai-insights/PAY_EQUITY_SCORE');
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
    } finally {
      setTesting(false);
    }
  };

  const handleExport = async (endpoint: string) => {
    setExportLoading(endpoint);
    try {
      const response = await api.get(`/export/${endpoint}`, { responseType: 'blob' });
      const ext = endpoint.includes('csv') ? 'csv' : 'json';
      const name = endpoint.split('/').pop() || 'export';
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${name}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExportLoading('');
    }
  };

  const { data: usersRaw } = useQuery({
    queryKey: ['platform-users'],
    queryFn: async () => { const r = await api.get('/users'); return r.data; },
    enabled: activeTab === 'users',
  });
  const { data: pendingInvitesRaw } = useQuery({
    queryKey: ['platform-invites'],
    queryFn: async () => { const r = await api.get('/users/invites'); return r.data; },
    enabled: activeTab === 'users',
  });
  const platformUsers: any[] = (usersRaw as any)?.data ?? [];
  const pendingInvites: any[] = (pendingInvitesRaw as any)?.data ?? [];

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setInviteUrl(null);
    try {
      const r = await api.post('/users/invite', { email: inviteEmail, role: inviteRole });
      setInviteUrl(r.data.data.inviteUrl);
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: ['platform-invites'] });
      toast.success('Invite created — share the link below');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to create invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.patch(`/users/${userId}/role`, { role });
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('Role updated');
    } catch {
      toast.error('Failed to update role');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await api.delete(`/users/${userId}`);
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User removed');
    } catch {
      toast.error('Failed to remove user');
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await api.delete(`/users/invites/${inviteId}`);
      qc.invalidateQueries({ queryKey: ['platform-invites'] });
      toast.success('Invite revoked');
    } catch {
      toast.error('Failed to revoke invite');
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'general',       label: 'General',          icon: Settings  },
    { key: 'users',         label: 'Users & Roles',    icon: Users     },
    { key: 'api',           label: 'API Connections',  icon: Key       },
    { key: 'data',          label: 'Data Management',  icon: Database  },
    { key: 'notifications', label: 'Notifications',    icon: Bell      },
    { key: 'email',         label: 'Email (SMTP)',      icon: Mail      },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Admin-only: company configuration, API connections and integrations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar */}
        <div className="space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                activeTab === tab.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <tab.icon className="w-4 h-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="lg:col-span-3">

          {/* GENERAL */}
          {activeTab === 'general' && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">General Configuration</h3>
              <div className="grid grid-cols-1 gap-4">
                {[
                  { label: 'Company Name',     value: 'TechCorp India Pvt. Ltd.', readonly: false },
                  { label: 'Currency',          value: 'INR (₹)',                  readonly: false },
                  { label: 'Fiscal Year Start', value: 'April',                    readonly: false },
                  { label: 'Platform Version',  value: '2.0.0',                    readonly: true  },
                ].map(field => (
                  <div key={field.label}>
                    <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                    <input
                      type="text"
                      defaultValue={field.value}
                      readOnly={field.readonly}
                      className={cn(
                        'mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm',
                        'focus:outline-none focus:ring-2 focus:ring-primary/20',
                        field.readonly && 'opacity-60 cursor-not-allowed',
                      )}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  Save Changes
                </button>
                <button className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Reset to Defaults
                </button>
              </div>
            </div>
          )}

          {/* USERS & ROLES */}
          {activeTab === 'users' && (
            <div className="space-y-5">
              {/* Invite new user */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Invite a Team Member</h3>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-muted-foreground">Email address</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={e => { setInviteEmail(e.target.value); setInviteUrl(null); }}
                      placeholder="colleague@company.com"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="w-36">
                    <label className="text-xs font-medium text-muted-foreground">Role</label>
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value as typeof inviteRole)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="HR_MANAGER">HR Manager</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <button
                    onClick={handleInvite}
                    disabled={inviteLoading || !inviteEmail.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {inviteLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Invite
                  </button>
                </div>
                {inviteUrl && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Invite link (share with your colleague):</p>
                      <code className="text-xs text-green-800 dark:text-green-300 break-all">{inviteUrl}</code>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Link copied!'); }}
                      className="flex-shrink-0 p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <Copy className="w-4 h-4 text-green-600" />
                    </button>
                  </div>
                )}
              </div>

              {/* Current users */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/20">
                  <h3 className="text-sm font-semibold text-foreground">Team Members ({platformUsers.length})</h3>
                </div>
                <div className="divide-y divide-border">
                  {platformUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-4 px-5 py-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{u.name} {u.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        disabled={u.id === me?.id}
                        className="px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="VIEWER">Viewer</option>
                        <option value="HR_MANAGER">HR Manager</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        disabled={u.id === me?.id}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending invites */}
              {pendingInvites.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-muted/20">
                    <h3 className="text-sm font-semibold text-foreground">Pending Invites ({pendingInvites.length})</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {pendingInvites.map((inv: any) => (
                      <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{inv.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {inv.role} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Pending
                        </span>
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Revoke invite"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* API CONNECTIONS */}
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Backend API</h3>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {healthRaw ? (
                    <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm text-green-700 dark:text-green-400">Connected</span></>
                  ) : (
                    <><XCircle className="w-4 h-4 text-red-500" /><span className="text-sm text-red-700 dark:text-red-400">Disconnected</span></>
                  )}
                  <code className="text-xs text-muted-foreground ml-auto">http://localhost:3001</code>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Claude AI (Anthropic)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Powers AI Insights and executive summaries</p>
                  </div>
                  <button
                    onClick={testClaudeApi}
                    disabled={testing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn('w-3.5 h-3.5', testing && 'animate-spin')} />
                    Test Connection
                  </button>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {apiStatus === 'unknown' && <div className="w-2 h-2 rounded-full bg-muted-foreground" />}
                  {apiStatus === 'ok'      && <CheckCircle className="w-4 h-4 text-green-500" />}
                  {apiStatus === 'error'   && <XCircle     className="w-4 h-4 text-red-500"   />}
                  <span className={cn('text-sm',
                    apiStatus === 'ok' ? 'text-green-700 dark:text-green-400' :
                    apiStatus === 'error' ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground',
                  )}>
                    {apiStatus === 'unknown' ? 'Not tested' : apiStatus === 'ok' ? 'API key valid' : 'Connection failed'}
                  </span>
                  <code className="text-xs text-muted-foreground ml-auto">claude-sonnet-4-6</code>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Database</h3>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-700 dark:text-green-400">PostgreSQL connected</span>
                  <code className="text-xs text-muted-foreground ml-auto">Neon (cloud)</code>
                </div>
              </div>
            </div>
          )}

          {/* DATA MANAGEMENT */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Export Data</h3>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'Employees CSV',    desc: 'Export all active employee data',            endpoint: 'employees/csv',    icon: '👥' },
                    { label: 'Employees JSON',   desc: 'Full employee data with all fields',          endpoint: 'employees/json',   icon: '📄' },
                    { label: 'Pay Equity Data',  desc: 'Gender pay gap and compa-ratio data',         endpoint: 'pay-equity/json',  icon: '⚖️' },
                    { label: 'Salary Bands CSV', desc: 'All salary band configurations',              endpoint: 'salary-bands/csv', icon: '📊' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{item.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleExport(item.endpoint)}
                        disabled={exportLoading === item.endpoint}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
                      >
                        {exportLoading === item.endpoint
                          ? <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                          : <span>&#8595;</span>}
                        {exportLoading === item.endpoint ? 'Exporting...' : 'Export'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Database Info</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: 'Environment', value: 'Development'   },
                    { label: 'Database',    value: 'PostgreSQL 15' },
                    { label: 'ORM',         value: 'Prisma 5.x'   },
                    { label: 'Cache',       value: 'Redis 7'       },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between p-2 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">Notification Thresholds</h3>
              <div className="space-y-4">
                {[
                  { label: 'Pay Anomaly Alert',      desc: 'Trigger when employee salary falls outside band',  on: true  },
                  { label: 'Budget Threshold Alert', desc: 'Alert when department spend exceeds % of budget',   on: true  },
                  { label: 'RSU Vesting Reminder',   desc: 'Notify 30 days before RSU vesting date',            on: true  },
                  { label: 'Compa-Ratio Warning',    desc: 'Alert when compa-ratio drops below 80%',             on: true  },
                  { label: 'New Hire Parity Check',  desc: 'Check new hire pay against existing employees',      on: false },
                ].map(notif => (
                  <div key={notif.label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium text-foreground">{notif.label}</p>
                      <p className="text-xs text-muted-foreground">{notif.desc}</p>
                    </div>
                    <div className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                      notif.on ? 'bg-primary' : 'bg-muted',
                    )}>
                      <span className={cn(
                        'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm',
                        notif.on ? 'translate-x-4' : 'translate-x-1',
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMAIL SMTP */}
          {activeTab === 'email' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">SMTP Configuration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure outbound email. Set these values in <code className="bg-muted px-1 rounded">backend/.env</code> — they are not editable at runtime.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'SMTP Host',      envKey: 'SMTP_HOST',      placeholder: 'smtp.gmail.com' },
                    { label: 'SMTP Port',      envKey: 'SMTP_PORT',      placeholder: '587' },
                    { label: 'SMTP User',      envKey: 'SMTP_USER',      placeholder: 'alerts@yourcompany.com' },
                    { label: 'SMTP Password',  envKey: 'SMTP_PASS',      placeholder: '••••••••' },
                    { label: 'HR Alert Email', envKey: 'HR_ALERT_EMAIL', placeholder: 'hr-lead@yourcompany.com' },
                  ].map(f => (
                    <div key={f.envKey}>
                      <label className="text-xs font-medium text-muted-foreground">
                        {f.label} <code className="bg-muted px-1 rounded ml-1">{f.envKey}</code>
                      </label>
                      <input
                        type={f.envKey === 'SMTP_PASS' ? 'password' : 'text'}
                        placeholder={f.placeholder}
                        readOnly
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm opacity-70 cursor-not-allowed"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  These fields are read-only here. Edit <code>backend/.env</code> and restart the server to apply changes.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Manual Email Triggers</h3>
                <div className="space-y-3">
                  {[
                    { endpoint: 'low-performer-alert', label: 'Low Performer Alerts',  desc: 'Send emails to managers with direct reports rated below 3.0', icon: '⚠️' },
                    { endpoint: 'pay-anomaly-alert',   label: 'Pay Anomaly Alert',      desc: 'Send pay anomaly summary to HR_ALERT_EMAIL',                 icon: '💰' },
                    { endpoint: 'rsu-reminders',       label: 'RSU Cliff Reminders',    desc: 'Email employees with RSU vesting events in next 30 days',      icon: '📈' },
                  ].map(item => (
                    <div key={item.endpoint} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{item.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSendEmail(item.endpoint, item.label)}
                        disabled={emailSending === item.endpoint}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0"
                      >
                        {emailSending === item.endpoint
                          ? <div className="w-3 h-3 border border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          : <Mail className="w-3 h-3" />}
                        {emailSending === item.endpoint ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
