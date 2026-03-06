import { useState } from 'react';
import { User, Lock, Palette, Monitor, Sun, Moon, LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';

type Tab = 'profile' | 'security' | 'appearance';

function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark' | 'system') || 'system';
  });

  const applyTheme = (t: 'light' | 'dark' | 'system') => {
    setThemeState(t);
    localStorage.setItem('theme', t);
    const root = document.documentElement;
    if (t === 'dark') root.classList.add('dark');
    else if (t === 'light') root.classList.remove('dark');
    else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      prefersDark ? root.classList.add('dark') : root.classList.remove('dark');
    }
  };

  return { theme, applyTheme };
}

export default function UserSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [displayName, setDisplayName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [revokingSessions, setRevokingSessions] = useState(false);
  const { user, logout, setUser } = useAuthStore();
  const { theme, applyTheme } = useTheme();

  // init displayName from user once
  if (user && !displayName) setDisplayName(user.name);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.newPw !== pwForm.confirm) {
      toast.error('New passwords do not match');
      return;
    }
    if (pwForm.newPw.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.newPw,
      });
      toast.success('Password changed', { description: 'You will be logged out for security.' });
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => logout(), 1500);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Failed to change password';
      toast.error(msg);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      const r = await api.patch('/auth/me', { name: displayName.trim() });
      if (setUser) setUser(r.data.data);
      toast.success('Display name updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message ?? 'Failed to update name');
    } finally {
      setSavingName(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    setRevokingSessions(true);
    try {
      await api.delete('/auth/sessions');
      toast.success('All sessions revoked', { description: 'You will be logged out.' });
      setTimeout(() => logout(), 1500);
    } catch {
      toast.error('Failed to revoke sessions');
    } finally {
      setRevokingSessions(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'profile',    label: 'Profile',    icon: User    },
    { key: 'security',   label: 'Security',   icon: Lock    },
    { key: 'appearance', label: 'Appearance', icon: Palette },
  ];

  const sessionInfo = {
    lastLogin: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    email: user?.email ?? '—',
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">User Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your profile, password, and preferences</p>
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

          <div className="pt-4 mt-4 border-t border-border">
            <button
              onClick={() => logout()}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">

          {/* PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-5">
                <h3 className="text-sm font-semibold text-foreground">Profile Information</h3>

                {/* Avatar */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xl font-bold text-primary">
                      {(user?.name ?? 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{user?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{user?.email ?? '—'}</p>
                  </div>
                </div>

                {/* Editable fields */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email Address</label>
                    <input
                      type="email"
                      defaultValue={user?.email ?? ''}
                      readOnly
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm opacity-60 cursor-not-allowed"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">Email cannot be changed. Contact your admin.</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !displayName.trim() || displayName === user?.name}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingName && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {savingName ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </div>

              {/* Session info */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Session</h3>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {[
                    { label: 'Current Session', value: 'Active' },
                    { label: 'Last Login',       value: sessionInfo.lastLogin },
                  ].map(item => (
                    <div key={item.label} className="flex justify-between p-2.5 rounded-lg bg-muted/30">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
              <p className="text-xs text-muted-foreground -mt-2">
                After changing your password, you will be logged out from all sessions.
              </p>

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Current Password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.current}
                    onChange={e => setPwForm(p => ({ ...p, current: e.target.value }))}
                    placeholder="••••••••"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">New Password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.newPw}
                    onChange={e => setPwForm(p => ({ ...p, newPw: e.target.value }))}
                    placeholder="Min 8 characters"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={pwForm.confirm}
                    onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                    placeholder="Repeat new password"
                    className={cn(
                      'mt-1 w-full px-3 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20',
                      pwForm.confirm && pwForm.newPw !== pwForm.confirm
                        ? 'border-red-400 focus:ring-red-400/20'
                        : 'border-border',
                    )}
                  />
                  {pwForm.confirm && pwForm.newPw !== pwForm.confirm && (
                    <p className="text-[10px] text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={changingPassword || !pwForm.current || !pwForm.newPw || !pwForm.confirm}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {changingPassword && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {changingPassword ? 'Changing…' : 'Change Password'}
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Active Sessions</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Log out from all devices — use this if you suspect unauthorised access.
                </p>
              </div>
              <button
                onClick={handleRevokeAllSessions}
                disabled={revokingSessions}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
              >
                {revokingSessions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                {revokingSessions ? 'Revoking…' : 'Log out all devices'}
              </button>
            </div>
            </div>
          )}

          {/* APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-5">
              <h3 className="text-sm font-semibold text-foreground">Theme Preference</h3>

              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: 'light',  label: 'Light',  icon: Sun     },
                  { value: 'dark',   label: 'Dark',   icon: Moon    },
                  { value: 'system', label: 'System', icon: Monitor },
                ] as const).map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => applyTheme(opt.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all',
                        theme === opt.value
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-muted-foreground/50',
                      )}
                    >
                      <Icon className={cn('w-5 h-5', theme === opt.value ? 'text-primary' : 'text-muted-foreground')} />
                      <span className={cn('text-xs font-medium', theme === opt.value ? 'text-primary' : 'text-muted-foreground')}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Your theme preference is saved locally in your browser.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
