// Backend-local type definitions (extracted from shared/ to eliminate cross-package imports)

export type UserRole = 'ADMIN' | 'HR_MANAGER' | 'HR_STAFF' | 'VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  permissions?: string[];
  lastLoginAt?: string | null;
}

// ─── Feature Permission Keys ──────────────────────────────────
// Keep in sync with shared/constants/index.ts FEATURE_KEYS and HR_STAFF_DEFAULT_PERMISSIONS.
export const HR_STAFF_DEFAULT_PERMISSIONS: string[] = [
  'dashboard',
  'employee.view',
  'employee.manage',
  'employee.delete',
  'pay_equity',
  'salary_bands',
  'scenario.view',
  'scenario.run',
  'benefits.view',
  'benefits.manage',
  'variable_pay',
  'performance.view',
  'performance.manage',
  'ai_insights',
  'data_center',
  'notifications',
  'email',
  // Excluded: scenario.apply, ai_scan, audit_log, user.manage, settings.platform
];

// ─── Socket Payload Types ─────────────────────────────────────

export interface SocketNotificationPayload {
  notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    isRead: boolean;
    createdAt: string;
    metadata?: Record<string, unknown> | null;
  };
}

export interface SocketPayAnomalyPayload {
  employee: {
    id: string;
    employeeId: string;
    firstName: string;
    lastName: string;
    band: string;
    annualCtc: number;
  };
  band: {
    id: string;
    minSalary: number;
    midSalary: number;
    maxSalary: number;
  };
  delta: number;
  deviationType: 'ABOVE' | 'BELOW';
}

export interface SocketBudgetThresholdPayload {
  department: string;
  used: number;
  limit: number;
  percentUsed: number;
}

export interface SocketRsuVestingPayload {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
  };
  grant: {
    id: string;
    totalUnits: number;
  };
  units: number;
  estimatedValue?: number;
}

// ─── Band Order (single source of truth for backend) ─────────
export const BAND_ORDER = [
  'A1', 'A2',
  'P1', 'P2', 'P3', 'P4',
  'M0', 'M1', 'M2', 'M3',
  'D0', 'D1', 'D2',
  'V0', 'V1', 'V2',
  'E0', 'E1', 'E2',
] as const;
export type BandCode = typeof BAND_ORDER[number];

// ─── Socket Event Names ───────────────────────────────────────

export const SOCKET_EVENTS = {
  NOTIFICATION_NEW:      'notification:new',
  NOTIFICATION_CRITICAL: 'notification:critical',
  PAY_ANOMALY:           'pay:anomaly',
  BUDGET_THRESHOLD:      'budget:threshold',
  RSU_VESTING:           'rsu:vesting',
  DASHBOARD_REFRESH:     'dashboard:refresh',
  EMPLOYEE_CREATED:      'employee:created',
  EMPLOYEE_UPDATED:      'employee:updated',
  EMPLOYEE_DATA_CHANGED: 'employee:data:changed',
  SALARY_BAND_UPDATED:   'salary:band:updated',
  IMPORT_PROGRESS:            'import:progress',
  IMPORT_COMPLETE:            'import:complete',
  BENEFITS_IMPORT_PROGRESS:   'benefits:import:progress',
  BENEFITS_IMPORT_COMPLETE:   'benefits:import:complete',
  JOB_ARCHITECTURE_UPDATED:   'job-architecture:updated',
} as const;
