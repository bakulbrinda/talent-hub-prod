import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react';

function IMochaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <circle
        cx="14" cy="14" r="9.5"
        stroke="#F56521" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray="15 5 15 5 15 5"
        transform="rotate(-130 14 14)"
      />
      <circle cx="22" cy="9" r="2.5" fill="#F56521" />
    </svg>
  );
}

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<{ email: string; expiresAt: string; userExists: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate token on mount
  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    fetch(`/api/users/invite/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.data) setInvite(d.data);
        else setInvalid(true);
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isReset = invite?.userExists;
    if (!isReset && !name.trim()) return;
    if (password.length < 8) return;

    setSubmitting(true);
    setError(null);

    try {
      const endpoint = isReset ? '/api/users/apply-reset' : '/api/users/accept-invite';
      const body = isReset
        ? { token, password }
        : { token, name, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || (isReset ? 'Failed to reset password' : 'Failed to create account'));
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <IMochaIcon size={32} />
            <span className="text-xl font-bold text-foreground tracking-tight">CompSense</span>
          </div>
          <p className="text-sm text-muted-foreground">Powered by iMocha</p>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!loading && invalid && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 p-6 text-center space-y-2">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
            <p className="font-semibold text-red-700 dark:text-red-400">Invalid or Expired Invite</p>
            <p className="text-sm text-red-600 dark:text-red-500">
              This invite link is no longer valid. Please ask your admin to send a new invite.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Back to login
            </button>
          </div>
        )}

        {!loading && success && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-900/10 p-6 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
            <p className="font-semibold text-green-700 dark:text-green-400">
              {invite?.userExists ? 'Password Reset!' : 'Account Created!'}
            </p>
            <p className="text-sm text-muted-foreground">Redirecting to login…</p>
          </div>
        )}

        {!loading && invite && !success && (
          <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-5">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-foreground">
                {invite.userExists ? 'Set a new password' : "You've been invited!"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {invite.userExists
                  ? <>Reset password for <strong className="text-foreground">{invite.email}</strong></>
                  : <>Set up your account for <strong className="text-foreground">{invite.email}</strong></>
                }
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!invite.userExists && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Your full name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  {invite.userExists ? 'New password' : 'Create a password'}
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting || (!invite.userExists && !name.trim()) || password.length < 8}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {invite.userExists ? 'Resetting…' : 'Creating account…'}
                  </span>
                ) : invite.userExists ? 'Set new password' : 'Create account & sign in'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
