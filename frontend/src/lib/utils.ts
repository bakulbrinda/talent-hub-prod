import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Currency Formatting ──────────────────────────────────────
export const formatINR = (amount: number, compact = false): string => {
  if (compact) {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
    return `₹${amount.toLocaleString('en-IN')}`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

// ─── Date Formatting ──────────────────────────────────────────
export const formatDate = (date: string | Date, options?: Intl.DateTimeFormatOptions): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', options || { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatRelativeTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
};

export const getTenureMonths = (dateOfJoining: string): number => {
  const join = new Date(dateOfJoining);
  const now = new Date();
  return (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
};

export const formatTenure = (months: number): string => {
  if (months < 12) return `${months}mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
};

// ─── Number Formatting ────────────────────────────────────────
export const formatPercent = (value: number, decimals = 1): string =>
  `${value.toFixed(decimals)}%`;

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat('en-IN').format(value);

// ─── Compa-Ratio Helpers ──────────────────────────────────────
export const getCompaRatioColor = (ratio: number): string => {
  if (ratio < 80) return '#ef4444';   // red
  if (ratio > 120) return '#f59e0b';  // amber
  return '#22c55e';                    // green
};

export const getCompaRatioLabel = (ratio: number): string => {
  if (ratio < 80) return 'Below Band';
  if (ratio > 120) return 'Above Band';
  return 'In Range';
};

export const getCompaRatioBadgeClass = (ratio: number): string => {
  if (ratio < 80) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (ratio > 120) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
};

// ─── Initials ─────────────────────────────────────────────────
export const getInitials = (firstName: string, lastName: string): string =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

// ─── Band Colors ──────────────────────────────────────────────
export const BAND_COLOR_MAP: Record<string, string> = {
  // Band 1
  A1: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  A2: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  // Band 2
  P1: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  P2: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  // Band 3
  P3: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  // Band 4
  M1: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  M2: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  // Band 5
  D0: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  D1: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  D2: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  // Legacy (backward compat for existing data)
  P4: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
};

export const getBandColor = (band: string): string =>
  BAND_COLOR_MAP[band] || 'bg-gray-100 text-gray-700';

// ─── Severity Colors ──────────────────────────────────────────
export const getSeverityColor = (severity: string): string => {
  switch (severity) {
    case 'CRITICAL': return 'text-red-500';
    case 'WARNING': return 'text-amber-500';
    case 'INFO': return 'text-blue-500';
    default: return 'text-gray-500';
  }
};
