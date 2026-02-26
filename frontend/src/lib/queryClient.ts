import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AxiosError } from 'axios';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,          // 30 seconds default
      gcTime: 5 * 60 * 1000,         // 5 minutes cache
      retry: (failureCount, error) => {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401) return false;
        if (axiosError.response?.status === 404) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        const axiosError = error as AxiosError<{ error: { message: string } }>;
        const message = axiosError.response?.data?.error?.message || 'An error occurred';
        toast.error(message);
      },
    },
  },
});

// ─── Stale Times ──────────────────────────────────────────────
export const STALE_TIMES = {
  LIVE: 15 * 1000,           // 15s — dashboard KPIs, notifications
  SHORT: 30 * 1000,          // 30s — employee data
  MEDIUM: 5 * 60 * 1000,     // 5min — pay equity, performance
  LONG: 15 * 60 * 1000,      // 15min — salary bands, job codes
  STATIC: 60 * 60 * 1000,    // 1hr — skills, benefits catalog
};

// ─── Query Keys ───────────────────────────────────────────────
export const queryKeys = {
  auth: {
    me: ['auth', 'me'],
  },
  dashboard: {
    kpis: ['dashboard', 'kpis'],
    salaryDistribution: ['dashboard', 'salary-distribution'],
    bandDistribution: ['dashboard', 'band-distribution'],
    compensationTrend: ['dashboard', 'compensation-trend'],
    payEquitySummary: ['dashboard', 'pay-equity-summary'],
    aiSummary: ['dashboard', 'ai-summary'],
  },
  employees: {
    all: (filters?: Record<string, unknown>) => ['employees', filters],
    detail: (id: string) => ['employees', id],
    summary: ['employees', 'analytics', 'summary'],
  },
  jobArchitecture: {
    hierarchy: ['job-architecture', 'hierarchy'],
    areas: ['job-areas'],
    families: (areaId?: string) => ['job-families', areaId],
    bands: ['bands'],
    jobCodes: (filters?: Record<string, unknown>) => ['job-codes', filters],
    skills: ['skills'],
  },
  salaryBands: {
    all: (filters?: Record<string, unknown>) => ['salary-bands', filters],
    outliers: ['salary-bands', 'outliers'],
    benchmarks: (filters?: Record<string, unknown>) => ['market-benchmarks', filters],
  },
  payEquity: {
    genderGap: (filters?: Record<string, unknown>) => ['pay-equity', 'gender-gap', filters],
    heatmap: ['pay-equity', 'heatmap'],
    distribution: (filters?: Record<string, unknown>) => ['pay-equity', 'distribution', filters],
    score: ['pay-equity', 'score'],
    outliers: ['pay-equity', 'outliers'],
    newHireParity: ['pay-equity', 'new-hire-parity'],
  },
  aiInsights: {
    all: (type?: string) => ['ai-insights', type],
    detail: (type: string, filters?: Record<string, unknown>) => ['ai-insights', type, filters],
  },
  benefits: {
    catalog: ['benefits', 'catalog'],
    utilization: ['benefits', 'utilization'],
    analytics: ['benefits', 'analytics'],
    employee: (employeeId: string) => ['benefits', 'employee', employeeId],
  },
  rsu: {
    grants: (filters?: Record<string, unknown>) => ['rsu', 'grants', filters],
    summary: ['rsu', 'summary'],
    eligibility: ['rsu', 'eligibility'],
    upcoming: (days: number) => ['rsu', 'upcoming', days],
  },
  performance: {
    ratings: (filters?: Record<string, unknown>) => ['performance', 'ratings', filters],
    matrix: ['performance', 'matrix'],
    promotionReadiness: ['performance', 'promotion-readiness'],
    payAlignmentGaps: ['performance', 'pay-alignment-gaps'],
  },
  scenarios: {
    all: ['scenarios'],
    detail: (id: string) => ['scenarios', id],
  },
  notifications: {
    all: (filters?: Record<string, unknown>) => ['notifications', filters],
    summary: ['notifications', 'summary'],
  },
};
