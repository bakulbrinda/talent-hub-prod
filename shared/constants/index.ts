// ============================================================
// CompSense — Shared Constants & Enums
// ============================================================

import type { BandCode, InsightType, NotificationType } from '../types/index';

// ─── Band Configuration ───────────────────────────────────────
export const BANDS: { code: BandCode; label: string; level: number; isEligibleForRSU: boolean }[] = [
  { code: 'A1', label: 'Associate Level 1', level: 1, isEligibleForRSU: false },
  { code: 'A2', label: 'Associate Level 2', level: 2, isEligibleForRSU: false },
  { code: 'P1', label: 'Professional Level 1', level: 3, isEligibleForRSU: false },
  { code: 'P2', label: 'Professional Level 2', level: 4, isEligibleForRSU: true },
  { code: 'P3', label: 'Professional Level 3', level: 5, isEligibleForRSU: true },
  { code: 'P4', label: 'Professional Level 4', level: 6, isEligibleForRSU: true },
];

export const BAND_LEVELS: Record<BandCode, number> = {
  A1: 1, A2: 2, P1: 3, P2: 4, P3: 5, P4: 6,
};

export const BAND_COLORS: Record<BandCode, string> = {
  A1: '#94a3b8',
  A2: '#64748b',
  P1: '#6366f1',
  P2: '#8b5cf6',
  P3: '#a855f7',
  P4: '#d946ef',
};

// ─── Compa-Ratio Zones ────────────────────────────────────────
export const COMPA_RATIO_ZONES = {
  UNDERPAID: { min: 0, max: 80, color: '#ef4444', label: 'Below Band' },
  IN_RANGE: { min: 80, max: 120, color: '#22c55e', label: 'In Range' },
  OVERPAID: { min: 120, max: Infinity, color: '#f59e0b', label: 'Above Band' },
} as const;

export const COMPA_RATIO_BINS = [
  { range: '<70', min: 0, max: 70 },
  { range: '70–80', min: 70, max: 80 },
  { range: '80–90', min: 80, max: 90 },
  { range: '90–110', min: 90, max: 110 },
  { range: '110–120', min: 110, max: 120 },
  { range: '>120', min: 120, max: Infinity },
];

// ─── RSU Configuration ────────────────────────────────────────
export const RSU_VESTING_MONTHS = [12, 24, 36, 48]; // cliff at 12, then yearly
export const RSU_VESTING_PERCENT_PER_EVENT = 25; // 25% per event

export const RSU_GRANT_TIERS: Record<string, { min: number; max: number }> = {
  P2: { min: 50, max: 75 },
  P3: { min: 75, max: 100 },
  P4: { min: 100, max: 150 },
  LEADERSHIP: { min: 150, max: 300 },
};

export const RSU_ELIGIBILITY = {
  MIN_BAND_LEVEL: 4, // P2 = level 4
  MIN_PERFORMANCE_RATING: 4.0,
  MIN_TENURE_MONTHS: 12,
};

// ─── Socket Event Names ───────────────────────────────────────
export const SOCKET_EVENTS = {
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_CRITICAL: 'notification:critical',
  PAY_ANOMALY: 'pay:anomaly',
  BUDGET_THRESHOLD: 'budget:threshold',
  RSU_VESTING: 'rsu:vesting',
  DASHBOARD_REFRESH: 'dashboard:refresh',
} as const;

// ─── AI Insight Configuration ─────────────────────────────────
export const INSIGHT_CONFIG: Record<InsightType, { title: string; description: string; cacheTtlHours: number; icon: string }> = {
  PAY_EQUITY_SCORE: {
    title: 'Pay Equity Score',
    description: 'Gender and tenure pay gap analysis with equity score',
    cacheTtlHours: 6,
    icon: 'Scale',
  },
  ATTRITION_RISK: {
    title: 'Attrition Risk Analysis',
    description: 'Employees at risk based on pay position and tenure',
    cacheTtlHours: 4,
    icon: 'AlertTriangle',
  },
  RSU_ALLOCATION: {
    title: 'RSU Allocation Analysis',
    description: 'RSU grant distribution and eligibility gaps',
    cacheTtlHours: 6,
    icon: 'LineChart',
  },
  TOP_SALARIES: {
    title: 'Top 10 Salaries Report',
    description: 'Bi-annual top salary analysis with performance justification',
    cacheTtlHours: 24,
    icon: 'Trophy',
  },
  COMPA_RATIO_DISTRIBUTION: {
    title: 'Compa-Ratio Distribution',
    description: 'How employee salaries distribute across band ranges',
    cacheTtlHours: 6,
    icon: 'BarChart2',
  },
  NEW_HIRE_PARITY: {
    title: 'New Hire Parity Check',
    description: 'Salary parity between new hires and existing employees',
    cacheTtlHours: 4,
    icon: 'UserPlus',
  },
  BENEFITS_UTILIZATION: {
    title: 'Benefits Utilization',
    description: 'Benefits usage rates and spend optimization',
    cacheTtlHours: 12,
    icon: 'Gift',
  },
  VARIABLE_PAY_ACHIEVEMENT: {
    title: 'Variable Pay Achievement',
    description: 'Commission and incentive attainment analysis',
    cacheTtlHours: 6,
    icon: 'DollarSign',
  },
  SKILLS_PREMIUM_MAP: {
    title: 'Skills Premium Map',
    description: 'Which skills command salary premiums',
    cacheTtlHours: 12,
    icon: 'Zap',
  },
  PROMOTION_READINESS: {
    title: 'Promotion Readiness Matrix',
    description: 'Employees ready for promotion with pay adjustments needed',
    cacheTtlHours: 6,
    icon: 'TrendingUp',
  },
  TCOW_BY_DEPT: {
    title: 'Total Cost of Workforce',
    description: 'Full compensation cost breakdown by department',
    cacheTtlHours: 12,
    icon: 'Building2',
  },
  SALARY_GROWTH_TREND: {
    title: 'Salary Growth Trend',
    description: 'Year-over-year salary revision trends by band',
    cacheTtlHours: 24,
    icon: 'Activity',
  },
  COMMISSION_EFFECTIVENESS: {
    title: 'Commission Plan Effectiveness',
    description: 'Quota attainment and commission plan performance',
    cacheTtlHours: 6,
    icon: 'Target',
  },
  BUDGET_BURN_RATE: {
    title: 'Compensation Budget Burn',
    description: 'Budget utilization rate and end-of-year projection',
    cacheTtlHours: 2,
    icon: 'Flame',
  },
  CRITICAL_EMPLOYEES: {
    title: 'Critical & Irreplaceable Employees',
    description: 'Key talent retention analysis and market-rate corrections',
    cacheTtlHours: 8,
    icon: 'Star',
  },
};

// ─── Notification Labels ──────────────────────────────────────
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  PAY_ANOMALY: 'Pay Anomaly',
  BUDGET_ALERT: 'Budget Alert',
  NEW_HIRE_PARITY: 'New Hire Parity',
  RSU_VESTING: 'RSU Vesting',
  GENERAL: 'General',
};

// ─── Currency ─────────────────────────────────────────────────
export const CURRENCY = {
  code: 'INR',
  symbol: '₹',
  locale: 'en-IN',
};

export const formatCurrency = (amount: number, compact = false): string => {
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

// ─── Job Areas (default) ──────────────────────────────────────
export const DEFAULT_JOB_AREAS = [
  'Engineering',
  'Sales',
  'Operations',
  'Finance',
  'Human Resources',
  'Product',
];

// ─── Performance Labels ───────────────────────────────────────
export const PERFORMANCE_LABELS: Record<string, string> = {
  '5.0': 'Outstanding',
  '4.5': 'Exceptional',
  '4.0': 'Exceeds Expectations',
  '3.5': 'Meets & Exceeds',
  '3.0': 'Meets Expectations',
  '2.5': 'Partially Meets',
  '2.0': 'Below Expectations',
  '1.0': 'Unsatisfactory',
};

export const getPerformanceLabel = (rating: number): string => {
  if (rating >= 4.5) return 'Exceptional';
  if (rating >= 4.0) return 'Exceeds Expectations';
  if (rating >= 3.5) return 'Meets & Exceeds';
  if (rating >= 3.0) return 'Meets Expectations';
  if (rating >= 2.0) return 'Below Expectations';
  return 'Unsatisfactory';
};

// ─── Pay Equity Thresholds ────────────────────────────────────
export const PAY_EQUITY_THRESHOLDS = {
  GENDER_GAP_GOOD: 5,       // < 5% is good
  GENDER_GAP_WARNING: 10,   // 5-10% is warning
  // > 10% is critical
  EQUITY_SCORE_GOOD: 80,    // > 80 is good
  EQUITY_SCORE_WARNING: 60, // 60-80 is warning
  // < 60 is critical
};
