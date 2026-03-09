import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Settings, Database, Bell, Key, RefreshCw, CheckCircle, XCircle,
  Mail, Users, UserPlus, Copy, Trash2, UserX, UserCheck, KeyRound, Loader2, Eye, EyeOff,
  ChevronRight, ToggleLeft, ToggleRight, Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { FEATURE_KEYS, HR_STAFF_DEFAULT_PERMISSIONS } from '@shared/constants/index';

type Tab = 'users' | 'org' | 'notifications' | 'data' | 'api' | 'email';
type InviteRole = 'ADMIN' | 'HR_STAFF';

const INVITE_FEATURES: { key: string; label: string; group: string }[] = [
  { key: FEATURE_KEYS.EMPLOYEE_VIEW,      label: 'View Employees',               group: 'Employee Management' },
  { key: FEATURE_KEYS.EMPLOYEE_MANAGE,    label: 'Add / Edit Employees',         group: 'Employee Management' },
  { key: FEATURE_KEYS.EMPLOYEE_DELETE,    label: 'Delete Employees',             group: 'Employee Management' },
  { key: FEATURE_KEYS.PAY_EQUITY,         label: 'Pay Equity',                   group: 'Compensation' },
  { key: FEATURE_KEYS.SALARY_BANDS,       label: 'Salary Bands',                 group: 'Compensation' },
  { key: FEATURE_KEYS.SCENARIO_VIEW,      label: 'View Scenarios',               group: 'Compensation' },
  { key: FEATURE_KEYS.SCENARIO_RUN,       label: 'Run Scenarios',                group: 'Compensation' },
  { key: FEATURE_KEYS.SCENARIO_APPLY,     label: 'Apply Scenarios (high-impact)',group: 'Compensation' },
  { key: FEATURE_KEYS.VARIABLE_PAY,       label: 'Variable Pay',                 group: 'People' },
  { key: FEATURE_KEYS.PERFORMANCE_VIEW,   label: 'View Performance',             group: 'People' },
  { key: FEATURE_KEYS.PERFORMANCE_MANAGE, label: 'Manage Performance',           group: 'People' },
  { key: FEATURE_KEYS.BENEFITS_VIEW,      label: 'View Benefits',                group: 'Benefits' },
  { key: FEATURE_KEYS.BENEFITS_MANAGE,    label: 'Manage Benefits',              group: 'Benefits' },
  { key: FEATURE_KEYS.AI_INSIGHTS,        label: 'AI Insights',                  group: 'AI & Data' },
  { key: FEATURE_KEYS.AI_SCAN,            label: 'AI Proactive Scan',            group: 'AI & Data' },
  { key: FEATURE_KEYS.DATA_CENTER,        label: 'Data Center (imports)',        group: 'AI & Data' },
  { key: FEATURE_KEYS.NOTIFICATIONS,      label: 'Notifications',                group: 'Admin' },
  { key: FEATURE_KEYS.EMAIL,              label: 'Email Tools',                  group: 'Admin' },
  { key: FEATURE_KEYS.AUDIT_LOG,          label: 'Audit Log',                    group: 'Admin' },
];

export default function PlatformSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [testing, setTesting] = useState(false);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [exportLoading, setExportLoading] = useState('');
  const [emailSending, setEmailSending] = useState('');
  const [clearingCache, setClearingCache] = useState(false);
  const [triggeringScan, setTriggeringScan] = useState(false);

  // Users tab state
  const [directForm, setDirectForm] = useState({ name: '', email: '', password: '' });
  const [directLoading, setDirectLoading] = useState(false);

  // Invite modal state (3-step flow: details → permissions → confirmation)
  const [inviteStep, setInviteStep] = useState<1 | 2 | 3>(1);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [inviteRole, setInviteRole] = useState<InviteRole>('HR_STAFF');
  const [invitePerms, setInvitePerms] = useState<string[]>([...HR_STAFF_DEFAULT_PERMISSIONS]);
  const [inviteSending, setInviteSending] = useState(false);

  const handleInviteTogglePerm = (key: string) => {
    setInvitePerms(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleCreateAccount = async () => {
    if (!inviteName.trim() || !inviteEmail.trim() || invitePassword.length < 8) return;
    setInviteSending(true);
    try {
      const body: Record<string, unknown> = {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
        role: inviteRole,
      };
      if (inviteRole === 'HR_STAFF') body.permissions = invitePerms;
      await api.post('/users/create', body);
      // Send credentials email (non-blocking — don't fail if SMTP is unconfigured)
      api.post('/users/send-credentials', {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
      }).catch(() => {});
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      qc.invalidateQueries({ queryKey: ['platform-invites'] });
      toast.success(`Account created for ${inviteEmail.trim()}`);
      setInviteStep(3);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to create account');
    } finally {
      setInviteSending(false);
    }
  };

  const resetInviteFlow = () => {
    setInviteStep(1);
    setInviteName('');
    setInviteEmail('');
    setInvitePassword('');
    setShowInvitePassword(false);
    setInviteRole('HR_STAFF');
    setInvitePerms([...HR_STAFF_DEFAULT_PERMISSIONS]);
  };
  const [createdCreds, setCreatedCreds] = useState<{ name: string; email: string; password: string } | null>(() => {
    try { const s = sessionStorage.getItem('th:lastCreatedCreds'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [sendingCreds, setSendingCreds] = useState(false);
  const [showCredsPassword, setShowCredsPassword] = useState(false);

  const [resetUrls, setResetUrls] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Org tab state
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgForm, setOrgForm] = useState<{
    orgName: string;
    fiscalYearStartMonth: number;
    currencySymbol: string;
    hrAlertEmails: string;
  } | null>(null);

  // Notifications tab state
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifForm, setNotifForm] = useState<{
    aiScanEnabled: boolean;
    aiScanFrequencyMins: number;
    anomalyCompaThreshold: number;
    rsuReminderDays: number;
  } | null>(null);

  const qc = useQueryClient();
  const { user: me } = useAuthStore();

  // ─── Queries ──────────────────────────────────────────────────

  const { data: usersRaw } = useQuery({
    queryKey: ['platform-users'],
    queryFn: async () => { const r = await api.get('/users'); return r.data; },
    enabled: activeTab === 'users',
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: pendingInvitesRaw } = useQuery({
    queryKey: ['platform-invites'],
    queryFn: async () => { const r = await api.get('/users/invites'); return r.data; },
    enabled: activeTab === 'users',
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { data: orgConfigRaw } = useQuery({
    queryKey: ['org-config'],
    queryFn: async () => { const r = await api.get('/settings/org'); return r.data; },
    enabled: activeTab === 'org' || activeTab === 'notifications',
  });
  const { data: healthRaw } = useQuery({
    queryKey: ['health'],
    queryFn: async () => { const r = await api.get('/health'); return r.data; },
    retry: false,
  });

  const platformUsers: any[] = (usersRaw as any)?.data ?? [];
  const pendingInvites: any[] = (pendingInvitesRaw as any)?.data ?? [];
  const orgConfig: any = (orgConfigRaw as any)?.data ?? null;

  // Seed form state from config when loaded
  if (orgConfig && orgForm === null) {
    setOrgForm({
      orgName: orgConfig.orgName,
      fiscalYearStartMonth: orgConfig.fiscalYearStartMonth,
      currencySymbol: orgConfig.currencySymbol,
      hrAlertEmails: (orgConfig.hrAlertEmails || []).join(', '),
    });
    setNotifForm({
      aiScanEnabled: orgConfig.aiScanEnabled,
      aiScanFrequencyMins: orgConfig.aiScanFrequencyMins,
      anomalyCompaThreshold: orgConfig.anomalyCompaThreshold,
      rsuReminderDays: orgConfig.rsuReminderDays,
    });
  }

  // ─── Handlers ─────────────────────────────────────────────────

  const handleCreateDirect = async () => {
    if (!directForm.name.trim() || !directForm.email.trim() || directForm.password.length < 8) return;
    setDirectLoading(true);
    try {
      await api.post('/users/create', directForm);
      const creds = { ...directForm };
      sessionStorage.setItem('th:lastCreatedCreds', JSON.stringify(creds));
      setCreatedCreds(creds);
      setDirectForm({ name: '', email: '', password: '' });
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      qc.invalidateQueries({ queryKey: ['platform-invites'] });
      toast.success('Account created');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to create account');
    } finally {
      setDirectLoading(false);
    }
  };

  const handleSendCreds = async () => {
    if (!createdCreds) return;
    setSendingCreds(true);
    try {
      await api.post('/users/send-credentials', createdCreds);
      toast.success('Login details sent', { description: `Email sent to ${createdCreds.email}` });
    } catch {
      toast.error('Failed to send email — check SMTP config');
    } finally {
      setSendingCreds(false);
    }
  };

  const setLoading = (userId: string, key: string, val: boolean) => {
    setActionLoading(prev => ({ ...prev, [`${userId}:${key}`]: val }));
  };
  const isLoading = (userId: string, key: string) => !!actionLoading[`${userId}:${key}`];

  const handleDeactivate = async (userId: string) => {
    setLoading(userId, 'deactivate', true);
    try {
      await api.patch(`/users/${userId}/deactivate`);
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User deactivated');
    } catch {
      toast.error('Failed to deactivate user');
    } finally {
      setLoading(userId, 'deactivate', false);
    }
  };

  const handleReactivate = async (userId: string) => {
    setLoading(userId, 'reactivate', true);
    try {
      await api.patch(`/users/${userId}/reactivate`);
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User reactivated');
    } catch {
      toast.error('Failed to reactivate user');
    } finally {
      setLoading(userId, 'reactivate', false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setLoading(userId, 'reset', true);
    try {
      const r = await api.post(`/users/${userId}/reset-password`);
      setResetUrls(prev => ({ ...prev, [userId]: r.data.data.resetUrl }));
      toast.success('Reset link generated — share with the user');
    } catch {
      toast.error('Failed to generate reset link');
    } finally {
      setLoading(userId, 'reset', false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setLoading(userId, 'delete', true);
    try {
      await api.delete(`/users/${userId}`);
      qc.invalidateQueries({ queryKey: ['platform-users'] });
      toast.success('User removed');
    } catch {
      toast.error('Failed to remove user');
    } finally {
      setLoading(userId, 'delete', false);
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

  const handleSaveOrg = async () => {
    if (!orgForm) return;
    setOrgSaving(true);
    try {
      const emails = orgForm.hrAlertEmails
        .split(',')
        .map(e => e.trim())
        .filter(Boolean);
      await api.patch('/settings/org', { ...orgForm, hrAlertEmails: emails });
      qc.invalidateQueries({ queryKey: ['org-config'] });
      toast.success('Organisation settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setOrgSaving(false);
    }
  };

  const handleSaveNotif = async () => {
    if (!notifForm) return;
    setNotifSaving(true);
    try {
      await api.patch('/settings/org', notifForm);
      qc.invalidateQueries({ queryKey: ['org-config'] });
      toast.success('Notification settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setNotifSaving(false);
    }
  };

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
    } catch {
      toast.error('Export failed');
    } finally {
      setExportLoading('');
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await api.post('/settings/cache/clear');
      toast.success('AI cache cleared', { description: 'Next insight request will re-run Claude analysis' });
    } catch {
      toast.error('Failed to clear cache');
    } finally {
      setClearingCache(false);
    }
  };

  const handleTriggerScan = async () => {
    setTriggeringScan(true);
    try {
      await api.post('/notifications/trigger-scan');
      toast.success('AI scan triggered', { description: 'Results will appear in Notifications' });
    } catch {
      toast.error('Failed to trigger scan');
    } finally {
      setTriggeringScan(false);
    }
  };

  // ─── Tabs ──────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'users',         label: 'User Management',    icon: Users    },
    { key: 'org',           label: 'Organisation',        icon: Settings },
    { key: 'notifications', label: 'Notifications',       icon: Bell     },
    { key: 'data',          label: 'Data',                icon: Database },
    { key: 'api',           label: 'API Connections',     icon: Key      },
    { key: 'email',         label: 'Email (SMTP)',        icon: Mail     },
  ];

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Platform Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Company configuration and administration</p>
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

          {/* USER MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-5">
              {/* Invite a Team Member — 3-step flow */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Invite a Team Member</h3>
                  </div>
                  {/* Step indicator */}
                  {inviteStep < 3 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      {[1, 2].map(s => (
                        <span key={s} className={cn(
                          'w-5 h-5 rounded-full flex items-center justify-center font-medium',
                          inviteStep === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        )}>{s}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 1: Name + Email + Password + Role */}
                {inviteStep === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Full name</label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={e => setInviteName(e.target.value)}
                        placeholder="Jane Smith"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Email address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="jane@company.com"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Password (min 8 characters)</label>
                      <div className="mt-1 relative">
                        <input
                          type={showInvitePassword ? 'text' : 'password'}
                          value={invitePassword}
                          onChange={e => setInvitePassword(e.target.value)}
                          placeholder="Set a login password"
                          className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowInvitePassword(s => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showInvitePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-2 block">Role</label>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { role: 'ADMIN' as InviteRole, title: 'Admin', desc: 'Full platform access. Can manage users, apply scenarios, change settings.' },
                          { role: 'HR_STAFF' as InviteRole, title: 'HR Staff', desc: 'Operational access. Feature set is customisable in the next step.' },
                        ] as { role: InviteRole; title: string; desc: string }[]).map(opt => (
                          <button
                            key={opt.role}
                            onClick={() => setInviteRole(opt.role)}
                            className={cn(
                              'text-left p-3 rounded-lg border-2 transition-all',
                              inviteRole === opt.role
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/40'
                            )}
                          >
                            <p className="text-sm font-medium text-foreground">{opt.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => inviteRole === 'ADMIN' ? handleCreateAccount() : setInviteStep(2)}
                      disabled={!inviteName.trim() || !inviteEmail.trim() || invitePassword.length < 8 || inviteSending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {inviteSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : inviteRole === 'ADMIN' ? <UserPlus className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      {inviteSending ? 'Creating…' : inviteRole === 'ADMIN' ? 'Create account & send credentials' : 'Configure access →'}
                    </button>
                  </div>
                )}

                {/* Step 2: Feature Toggles (HR_STAFF only) */}
                {inviteStep === 2 && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Feature Access — defaults are pre-selected based on HR Staff role. Adjust before sending the invite.
                    </p>
                    {Array.from(new Set(INVITE_FEATURES.map(f => f.group))).map(group => (
                      <div key={group}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</p>
                        <div className="space-y-1">
                          {INVITE_FEATURES.filter(f => f.group === group).map(feat => {
                            const enabled = invitePerms.includes(feat.key);
                            return (
                              <button
                                key={feat.key}
                                onClick={() => handleInviteTogglePerm(feat.key)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                              >
                                <span className="text-sm text-foreground">{feat.label}</span>
                                {enabled
                                  ? <ToggleRight className="w-5 h-5 text-primary flex-shrink-0" />
                                  : <ToggleLeft className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                                }
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => setInviteStep(1)}
                        className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >← Back</button>
                      <button
                        onClick={handleCreateAccount}
                        disabled={inviteSending}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {inviteSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                        {inviteSending ? 'Creating…' : 'Create account & send credentials'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Success — show credentials */}
                {inviteStep === 3 && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">Account created for {inviteEmail}</p>
                        <p className="text-xs text-green-600/80 dark:text-green-500/80 mt-0.5">Role: {inviteRole} · Credentials emailed</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-muted-foreground">Login credentials (share directly if email fails)</p>
                      <div className="flex flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5 border border-border text-xs">
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-medium text-foreground">{inviteEmail}</span>
                          <button onClick={() => { navigator.clipboard.writeText(inviteEmail); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2.5 py-1.5 border border-border text-xs">
                          <span className="text-muted-foreground">Password:</span>
                          <span className="font-medium font-mono text-foreground">{showInvitePassword ? invitePassword : '••••••••'}</span>
                          <button onClick={() => setShowInvitePassword(s => !s)} className="text-muted-foreground hover:text-foreground">
                            {showInvitePassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </button>
                          <button onClick={() => { navigator.clipboard.writeText(invitePassword); toast.success('Password copied!'); }} className="text-muted-foreground hover:text-foreground">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={resetInviteFlow}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      + Add another team member
                    </button>
                  </div>
                )}
              </div>

              {/* Users table */}
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/20">
                  <h3 className="text-sm font-semibold text-foreground">Team Members ({platformUsers.length})</h3>
                </div>
                <div className="divide-y divide-border">
                  {platformUsers.map((u: any) => (
                    <div key={u.id} className="px-5 py-3 space-y-2">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                          u.isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                        )}>
                          {u.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground flex items-center gap-1.5 flex-wrap">
                            {u.name}
                            {u.id === me?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                            <span className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded font-medium',
                              u.role === 'ADMIN'      ? 'bg-primary/10 text-primary' :
                              u.role === 'HR_MANAGER' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              u.role === 'HR_STAFF'   ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                              'bg-muted text-muted-foreground'
                            )}>
                              {u.role === 'ADMIN' ? 'Admin' : u.role === 'HR_MANAGER' ? 'HR Manager' : u.role === 'HR_STAFF' ? 'HR Staff' : 'Viewer'}
                            </span>
                            {!u.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Inactive</span>}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          {u.lastLoginAt && (
                            <p className="text-[10px] text-muted-foreground">
                              Last login: {new Date(u.lastLoginAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Reset password */}
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            disabled={isLoading(u.id, 'reset')}
                            title="Generate reset link"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-30"
                          >
                            {isLoading(u.id, 'reset') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                          </button>
                          {/* Deactivate / Reactivate */}
                          {u.id !== me?.id && (
                            u.isActive ? (
                              <button
                                onClick={() => handleDeactivate(u.id)}
                                disabled={isLoading(u.id, 'deactivate')}
                                title="Deactivate user"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-30"
                              >
                                {isLoading(u.id, 'deactivate') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReactivate(u.id)}
                                disabled={isLoading(u.id, 'reactivate')}
                                title="Reactivate user"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-30"
                              >
                                {isLoading(u.id, 'reactivate') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </button>
                            )
                          )}
                          {/* Delete */}
                          <button
                            onClick={() => setDeleteConfirm({ id: u.id, name: u.name })}
                            disabled={u.id === me?.id || isLoading(u.id, 'delete')}
                            title="Remove user"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30"
                          >
                            {isLoading(u.id, 'delete') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                      {/* Reset URL display */}
                      {resetUrls[u.id] && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 ml-12">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-0.5">Reset link (expires in 7 days):</p>
                            <code className="text-[10px] text-amber-800 dark:text-amber-300 break-all">{resetUrls[u.id]}</code>
                          </div>
                          <button
                            onClick={() => { navigator.clipboard.writeText(resetUrls[u.id]); toast.success('Link copied!'); }}
                            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5 text-amber-600" />
                          </button>
                        </div>
                      )}
                      {/* Credentials strip — shown for the last-created user until dismissed */}
                      {createdCreds && u.email === createdCreds.email && (
                        <div className="ml-12 mt-1 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10 p-3 space-y-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-semibold text-green-700 dark:text-green-400">Account credentials — share with user</p>
                            <button
                              onClick={() => { sessionStorage.removeItem('th:lastCreatedCreds'); setCreatedCreds(null); }}
                              className="text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              Dismiss
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {[
                              { label: 'Email', value: createdCreds.email },
                            ].map(row => (
                              <div key={row.label} className="flex items-center gap-1.5 bg-white dark:bg-muted/30 rounded-lg px-2.5 py-1.5 border border-green-100 dark:border-green-800">
                                <span className="text-muted-foreground">{row.label}:</span>
                                <span className="font-medium text-foreground">{row.value}</span>
                                <button onClick={() => { navigator.clipboard.writeText(row.value); toast.success('Copied!'); }} className="text-muted-foreground hover:text-foreground">
                                  <Copy className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            <div className="flex items-center gap-1.5 bg-white dark:bg-muted/30 rounded-lg px-2.5 py-1.5 border border-green-100 dark:border-green-800">
                              <span className="text-muted-foreground">Password:</span>
                              <span className="font-medium text-foreground font-mono">{showCredsPassword ? createdCreds.password : '••••••••'}</span>
                              <button onClick={() => setShowCredsPassword(s => !s)} className="text-muted-foreground hover:text-foreground">
                                {showCredsPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                              <button onClick={() => { navigator.clipboard.writeText(createdCreds.password); toast.success('Password copied!'); }} className="text-muted-foreground hover:text-foreground">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <button
                            onClick={handleSendCreds}
                            disabled={sendingCreds}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                          >
                            {sendingCreds ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                            {sendingCreds ? 'Sending…' : `Send login details by email`}
                          </button>
                        </div>
                      )}
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
                            Expires {new Date(inv.expiresAt).toLocaleDateString()}
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

          {/* ORGANISATION */}
          {activeTab === 'org' && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">Organisation Configuration</h3>
              {!orgForm ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />Loading…
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Organisation Name</label>
                      <input
                        type="text"
                        value={orgForm.orgName}
                        onChange={e => setOrgForm(f => f && ({ ...f, orgName: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Fiscal Year Start Month</label>
                      <select
                        value={orgForm.fiscalYearStartMonth}
                        onChange={e => setOrgForm(f => f && ({ ...f, fiscalYearStartMonth: Number(e.target.value) }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Default Currency Symbol</label>
                      <input
                        type="text"
                        value={orgForm.currencySymbol}
                        onChange={e => setOrgForm(f => f && ({ ...f, currencySymbol: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        maxLength={5}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">HR Alert Email Recipients</label>
                      <input
                        type="text"
                        value={orgForm.hrAlertEmails}
                        onChange={e => setOrgForm(f => f && ({ ...f, hrAlertEmails: e.target.value }))}
                        placeholder="hr@company.com, lead@company.com"
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Comma-separated list of emails that receive anomaly alerts</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveOrg}
                    disabled={orgSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {orgSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {orgSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">Notifications & Alerts</h3>
              {!notifForm ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />Loading…
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <div>
                        <p className="text-sm font-medium text-foreground">Proactive AI Scan</p>
                        <p className="text-xs text-muted-foreground">Automatically scan for pay anomalies on a schedule</p>
                      </div>
                      <button
                        onClick={() => setNotifForm(f => f && ({ ...f, aiScanEnabled: !f.aiScanEnabled }))}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                          notifForm.aiScanEnabled ? 'bg-primary' : 'bg-muted',
                        )}
                      >
                        <span className={cn(
                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm',
                          notifForm.aiScanEnabled ? 'translate-x-4' : 'translate-x-1',
                        )} />
                      </button>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Scan Frequency</label>
                      <select
                        value={notifForm.aiScanFrequencyMins}
                        onChange={e => setNotifForm(f => f && ({ ...f, aiScanFrequencyMins: Number(e.target.value) }))}
                        disabled={!notifForm.aiScanEnabled}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
                      >
                        <option value={30}>Every 30 minutes</option>
                        <option value={60}>Every 1 hour</option>
                        <option value={120}>Every 2 hours</option>
                        <option value={360}>Every 6 hours</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Pay Anomaly Compa-Ratio Threshold (%)</label>
                      <input
                        type="number"
                        min={50} max={100}
                        value={notifForm.anomalyCompaThreshold}
                        onChange={e => setNotifForm(f => f && ({ ...f, anomalyCompaThreshold: Number(e.target.value) }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Alert when employee compa-ratio falls below this value</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground">RSU Vesting Reminder Lead Time (days)</label>
                      <input
                        type="number"
                        min={1} max={365}
                        value={notifForm.rsuReminderDays}
                        onChange={e => setNotifForm(f => f && ({ ...f, rsuReminderDays: Number(e.target.value) }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Send RSU reminder email this many days before vesting</p>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveNotif}
                    disabled={notifSaving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {notifSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {notifSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* DATA */}
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
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <span>↓</span>}
                        {exportLoading === item.endpoint ? 'Exporting…' : 'Export'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Actions</h3>
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">Trigger AI Scan Now</p>
                      <p className="text-xs text-muted-foreground">Manually run the proactive anomaly scan</p>
                    </div>
                    <button
                      onClick={handleTriggerScan}
                      disabled={triggeringScan}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      {triggeringScan ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      {triggeringScan ? 'Running…' : 'Run scan'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">Clear AI Insight Cache</p>
                      <p className="text-xs text-muted-foreground">Bust Redis <code className="bg-muted px-1 rounded">ai:*</code> and <code className="bg-muted px-1 rounded">dashboard:*</code> keys</p>
                    </div>
                    <button
                      onClick={handleClearCache}
                      disabled={clearingCache}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-50"
                    >
                      {clearingCache ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      {clearingCache ? 'Clearing…' : 'Clear cache'}
                    </button>
                  </div>
                </div>
              </div>
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
                  <code className="text-xs text-muted-foreground ml-auto">{window.location.origin}</code>
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
            </div>
          )}

          {/* EMAIL SMTP */}
          {activeTab === 'email' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">SMTP Configuration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure in <code className="bg-muted px-1 rounded">backend/.env</code> — not editable at runtime.
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
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Mail className="w-3 h-3" />}
                        {emailSending === item.endpoint ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Delete user account?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You are about to permanently delete <span className="font-medium text-foreground">{deleteConfirm.name}</span>.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-3 text-sm text-red-700 dark:text-red-400 space-y-1">
              <p className="font-medium">This action cannot be undone. It will:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs mt-1">
                <li>Permanently remove the user account and all access rights</li>
                <li>Immediately revoke all active login sessions</li>
                <li>Delete any pending invite or password-reset tokens</li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              If you only want to temporarily block access, use <span className="font-medium">Deactivate</span> instead.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const { id } = deleteConfirm;
                  setDeleteConfirm(null);
                  await handleDeleteUser(id);
                }}
                disabled={isLoading(deleteConfirm.id, 'delete')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isLoading(deleteConfirm.id, 'delete') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Yes, delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
