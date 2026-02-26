// Backend-local type definitions (extracted from shared/ to eliminate cross-package imports)

export type UserRole = 'ADMIN' | 'VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

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

// ─── Socket Event Names ───────────────────────────────────────

export const SOCKET_EVENTS = {
  NOTIFICATION_NEW:      'notification:new',
  NOTIFICATION_CRITICAL: 'notification:critical',
  PAY_ANOMALY:           'pay:anomaly',
  BUDGET_THRESHOLD:      'budget:threshold',
  RSU_VESTING:           'rsu:vesting',
  DASHBOARD_REFRESH:     'dashboard:refresh',
} as const;
