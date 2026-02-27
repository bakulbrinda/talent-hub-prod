import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Settings, Database, Bell, Key, RefreshCw, CheckCircle, XCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

type Tab = 'general' | 'api' | 'data' | 'notifications' | 'email';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [testing, setTesting] = useState(false);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown');
  const [exportLoading, setExportLoading] = useState('');
  const [emailSending, setEmailSending] = useState<string>('');

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
    queryFn: async () => {
      const r = await api.get('/health');
      return r.data;
    },
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

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'general',       label: 'General',          icon: Settings  },
    { key: 'api',           label: 'API Connections',  icon: Key       },
    { key: 'data',          label: 'Data Management',  icon: Database  },
    { key: 'notifications', label: 'Notifications',    icon: Bell      },
    { key: 'email',         label: 'Email (SMTP)',      icon: Mail      },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure CompSense platform settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* ── Sidebar ── */}
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

        {/* ── Content ── */}
        <div className="lg:col-span-3">

          {/* GENERAL */}
          {activeTab === 'general' && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">General Configuration</h3>
              <div className="grid grid-cols-1 gap-4">
                {[
                  { label: 'Company Name',      value: 'TechCorp India Pvt. Ltd.', readonly: false },
                  { label: 'Currency',           value: 'INR (₹)',                  readonly: false },
                  { label: 'Fiscal Year Start',  value: 'April',                    readonly: false },
                  { label: 'Platform Version',   value: '1.0.0',                    readonly: true  },
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

          {/* API CONNECTIONS */}
          {activeTab === 'api' && (
            <div className="space-y-4">
              {/* Backend */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Backend API</h3>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {healthRaw ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-700 dark:text-green-400">Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-700 dark:text-red-400">Disconnected</span>
                    </>
                  )}
                  <code className="text-xs text-muted-foreground ml-auto">http://localhost:3001</code>
                </div>
              </div>

              {/* Claude AI */}
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
                    apiStatus === 'ok'      ? 'text-green-700 dark:text-green-400' :
                    apiStatus === 'error'   ? 'text-red-700 dark:text-red-400'    :
                    'text-muted-foreground',
                  )}>
                    {apiStatus === 'unknown' ? 'Not tested' : apiStatus === 'ok' ? 'API key valid' : 'Connection failed'}
                  </span>
                  <code className="text-xs text-muted-foreground ml-auto">claude-sonnet-4-6</code>
                </div>
              </div>

              {/* Database */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Database</h3>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-700 dark:text-green-400">PostgreSQL connected</span>
                  <code className="text-xs text-muted-foreground ml-auto">localhost:5432</code>
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
                    { label: 'Employees CSV',   desc: 'Export all active employee data',            endpoint: 'employees/csv',    icon: '👥' },
                    { label: 'Employees JSON',  desc: 'Full employee data with all fields',          endpoint: 'employees/json',   icon: '📄' },
                    { label: 'Pay Equity Data', desc: 'Gender pay gap and compa-ratio data',         endpoint: 'pay-equity/json',  icon: '⚖️' },
                    { label: 'Salary Bands CSV',desc: 'All salary band configurations',              endpoint: 'salary-bands/csv', icon: '📊' },
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
              {/* SMTP Config */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">SMTP Configuration</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure outbound email. Set these values in <code className="bg-muted px-1 rounded">backend/.env</code> — they are not editable at runtime.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'SMTP Host',     envKey: 'SMTP_HOST',     placeholder: 'smtp.gmail.com' },
                    { label: 'SMTP Port',     envKey: 'SMTP_PORT',     placeholder: '587' },
                    { label: 'SMTP User',     envKey: 'SMTP_USER',     placeholder: 'alerts@yourcompany.com' },
                    { label: 'SMTP Password', envKey: 'SMTP_PASS',     placeholder: '••••••••' },
                    { label: 'HR Alert Email',envKey: 'HR_ALERT_EMAIL',placeholder: 'hr-lead@yourcompany.com' },
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

              {/* Manual Email Triggers */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Manual Email Triggers</h3>
                <div className="space-y-3">
                  {[
                    {
                      endpoint: 'low-performer-alert',
                      label: 'Low Performer Alerts',
                      desc: 'Send emails to all managers with direct reports rated below 3.0',
                      icon: '⚠️',
                    },
                    {
                      endpoint: 'pay-anomaly-alert',
                      label: 'Pay Anomaly Alert',
                      desc: 'Send pay anomaly summary to HR_ALERT_EMAIL',
                      icon: '💰',
                    },
                    {
                      endpoint: 'rsu-reminders',
                      label: 'RSU Cliff Reminders',
                      desc: 'Email employees with RSU vesting events in the next 30 days',
                      icon: '📈',
                    },
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
