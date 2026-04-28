// ============================================================
// CompSense — Shared Constants & Enums
// ============================================================

import type { BandCode, InsightType, NotificationType } from '../types/index';

// ─── Band Configuration ───────────────────────────────────────
// Full band ladder aligned to company Master Job Architecture
export const BANDS: { code: BandCode; label: string; level: number; isEligibleForRSU: boolean }[] = [
  // Band Group 1 — Associate
  { code: 'A1', label: 'Associate Level 1',          level: 1,  isEligibleForRSU: false },
  { code: 'A2', label: 'Associate Level 2',          level: 2,  isEligibleForRSU: false },
  // Band Group 2 — Professional
  { code: 'P1', label: 'Professional Level 1',       level: 3,  isEligibleForRSU: true  },
  { code: 'P2', label: 'Professional Level 2',       level: 4,  isEligibleForRSU: true  },
  { code: 'P3', label: 'Professional Level 3',       level: 5,  isEligibleForRSU: true  },
  { code: 'P4', label: 'Professional Level 4/Expert',level: 6,  isEligibleForRSU: true  },
  // Band Group 3 — Manager
  { code: 'M0', label: 'Associate Manager',          level: 7,  isEligibleForRSU: true  },
  { code: 'M1', label: 'Manager I',                  level: 8,  isEligibleForRSU: true  },
  { code: 'M2', label: 'Manager II',                 level: 9,  isEligibleForRSU: true  },
  { code: 'M3', label: 'Senior Manager',             level: 10, isEligibleForRSU: true  },
  // Band Group 4 — Director
  { code: 'D0', label: 'Associate Director',         level: 11, isEligibleForRSU: true  },
  { code: 'D1', label: 'Director',                   level: 12, isEligibleForRSU: true  },
  { code: 'D2', label: 'Senior Director',            level: 13, isEligibleForRSU: true  },
  // Band Group 5 — Vice President
  { code: 'V0', label: 'Associate Vice President',   level: 14, isEligibleForRSU: true  },
  { code: 'V1', label: 'Vice President',             level: 15, isEligibleForRSU: true  },
  { code: 'V2', label: 'Executive Vice President',   level: 16, isEligibleForRSU: true  },
  // Band Group 6 — Executive / C-Suite
  { code: 'E0', label: 'Executive Level I',          level: 17, isEligibleForRSU: true  },
  { code: 'E1', label: 'Executive Level II',         level: 18, isEligibleForRSU: true  },
  { code: 'E2', label: 'Executive Level III',        level: 19, isEligibleForRSU: true  },
];

export const BAND_LEVELS: Record<BandCode, number> = {
  A1: 1,  A2: 2,
  P1: 3,  P2: 4,  P3: 5,  P4: 6,
  M0: 7,  M1: 8,  M2: 9,  M3: 10,
  D0: 11, D1: 12, D2: 13,
  V0: 14, V1: 15, V2: 16,
  E0: 17, E1: 18, E2: 19,
};

export const BAND_ORDER: BandCode[] = [
  'A1', 'A2',
  'P1', 'P2', 'P3', 'P4',
  'M0', 'M1', 'M2', 'M3',
  'D0', 'D1', 'D2',
  'V0', 'V1', 'V2',
  'E0', 'E1', 'E2',
];

export const BAND_COLORS: Record<BandCode, string> = {
  // Associate — slate
  A1: '#94a3b8', A2: '#64748b',
  // Professional — indigo → purple
  P1: '#6366f1', P2: '#8b5cf6', P3: '#a855f7', P4: '#9333ea',
  // Manager — pink → rose
  M0: '#ec4899', M1: '#e879a0', M2: '#f43f5e', M3: '#e11d48',
  // Director — orange → red
  D0: '#f97316', D1: '#ef4444', D2: '#dc2626',
  // VP — deep red
  V0: '#b91c1c', V1: '#991b1b', V2: '#7f1d1d',
  // Executive — near black
  E0: '#450a0a', E1: '#3b0764', E2: '#1e0636',
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
  // Professional
  P1: { min: 25,  max: 50  },
  P2: { min: 50,  max: 75  },
  P3: { min: 75,  max: 100 },
  P4: { min: 100, max: 125 },
  // Manager
  M0: { min: 100, max: 125 },
  M1: { min: 125, max: 175 },
  M2: { min: 175, max: 225 },
  M3: { min: 225, max: 275 },
  // Director
  D0: { min: 275, max: 375 },
  D1: { min: 375, max: 550 },
  D2: { min: 550, max: 800 },
  // VP
  V0: { min: 800,  max: 1200 },
  V1: { min: 1200, max: 1800 },
  V2: { min: 1800, max: 2500 },
  // Executive
  E0: { min: 2500, max: 4000 },
  E1: { min: 4000, max: 6000 },
  E2: { min: 6000, max: 10000 },
};

export const RSU_ELIGIBILITY = {
  MIN_TENURE_MONTHS: 24, // Sole eligibility criterion: 2+ years of employment
};

// ─── Feature Permission Keys ──────────────────────────────────
// All available feature keys for the permission system.
// ADMIN accounts bypass all permission checks unconditionally.
// HR_STAFF accounts use HR_STAFF_DEFAULT_PERMISSIONS unless overridden at invite time.
export const FEATURE_KEYS = {
  DASHBOARD:           'dashboard',
  EMPLOYEE_VIEW:       'employee.view',
  EMPLOYEE_MANAGE:     'employee.manage',
  EMPLOYEE_DELETE:     'employee.delete',
  PAY_EQUITY:          'pay_equity',
  SALARY_BANDS:        'salary_bands',
  SCENARIO_VIEW:       'scenario.view',
  SCENARIO_RUN:        'scenario.run',
  SCENARIO_APPLY:      'scenario.apply',    // high-impact: writes salaries org-wide
  BENEFITS_VIEW:       'benefits.view',
  BENEFITS_MANAGE:     'benefits.manage',
  VARIABLE_PAY:        'variable_pay',
  PERFORMANCE_VIEW:    'performance.view',
  PERFORMANCE_MANAGE:  'performance.manage',
  AI_INSIGHTS:         'ai_insights',
  AI_SCAN:             'ai_scan',           // costs Anthropic API calls
  DATA_CENTER:         'data_center',
  NOTIFICATIONS:       'notifications',
  EMAIL:               'email',
  AUDIT_LOG:           'audit_log',
  USER_MANAGE:         'user.manage',
  SETTINGS_PLATFORM:   'settings.platform',
} as const;

// Default permissions granted to HR_STAFF users when no explicit override is set.
// Covers all operational day-to-day features; excludes high-impact / admin-only actions.
export const HR_STAFF_DEFAULT_PERMISSIONS: string[] = [
  FEATURE_KEYS.DASHBOARD,
  FEATURE_KEYS.EMPLOYEE_VIEW,
  FEATURE_KEYS.EMPLOYEE_MANAGE,
  FEATURE_KEYS.EMPLOYEE_DELETE,
  FEATURE_KEYS.PAY_EQUITY,
  FEATURE_KEYS.SALARY_BANDS,
  FEATURE_KEYS.SCENARIO_VIEW,
  FEATURE_KEYS.SCENARIO_RUN,
  FEATURE_KEYS.BENEFITS_VIEW,
  FEATURE_KEYS.BENEFITS_MANAGE,
  FEATURE_KEYS.VARIABLE_PAY,
  FEATURE_KEYS.PERFORMANCE_VIEW,
  FEATURE_KEYS.PERFORMANCE_MANAGE,
  FEATURE_KEYS.AI_INSIGHTS,
  FEATURE_KEYS.DATA_CENTER,
  FEATURE_KEYS.NOTIFICATIONS,
  FEATURE_KEYS.EMAIL,
  // Excluded: scenario.apply, ai_scan, audit_log, user.manage, settings.platform
];

// ─── Socket Event Names ───────────────────────────────────────
export const SOCKET_EVENTS = {
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_CRITICAL: 'notification:critical',
  PAY_ANOMALY: 'pay:anomaly',
  BUDGET_THRESHOLD: 'budget:threshold',
  RSU_VESTING: 'rsu:vesting',
  DASHBOARD_REFRESH: 'dashboard:refresh',
  // Cross-module data change events — emitted after any employee or band write
  EMPLOYEE_DATA_CHANGED: 'employee:data:changed',
  SALARY_BAND_UPDATED: 'salary:band:updated',
  EMPLOYEE_CREATED: 'employee:created',
  EMPLOYEE_UPDATED: 'employee:updated',
  IMPORT_PROGRESS: 'import:progress',
  IMPORT_COMPLETE: 'import:complete',
  BENEFITS_IMPORT_PROGRESS: 'benefits:import:progress',
  BENEFITS_IMPORT_COMPLETE: 'benefits:import:complete',
  JOB_ARCHITECTURE_UPDATED: 'job-architecture:updated',
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
