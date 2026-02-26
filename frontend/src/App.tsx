import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './components/layout/ThemeProvider';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AppShell } from './components/layout/AppShell';
import { useAuthStore } from './store/authStore';

// Lazy load all pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const JobArchitecturePage = lazy(() => import('./pages/JobArchitecturePage'));
const EmployeeDirectoryPage = lazy(() => import('./pages/EmployeeDirectoryPage'));
const EmployeeProfilePage = lazy(() => import('./pages/EmployeeProfilePage'));
const SalaryBandDesignerPage = lazy(() => import('./pages/SalaryBandDesignerPage'));
const PayEquityPage = lazy(() => import('./pages/PayEquityPage'));
const AIInsightsPage = lazy(() => import('./pages/AIInsightsPage'));
const BenefitsManagementPage = lazy(() => import('./pages/BenefitsManagementPage'));
const RSUTrackerPage = lazy(() => import('./pages/RSUTrackerPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const VariablePayPage = lazy(() => import('./pages/VariablePayPage'));
const ScenarioModelerPage = lazy(() => import('./pages/ScenarioModelerPage'));
const NotificationsCenterPage = lazy(() => import('./pages/NotificationsCenterPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes wrapped in AppShell */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="job-architecture" element={<JobArchitecturePage />} />
          <Route path="employees" element={<EmployeeDirectoryPage />} />
          <Route path="employees/:id" element={<EmployeeProfilePage />} />
          <Route path="salary-bands" element={<SalaryBandDesignerPage />} />
          <Route path="pay-equity" element={<PayEquityPage />} />
          <Route path="ai-insights" element={<AIInsightsPage />} />
          <Route path="benefits" element={<BenefitsManagementPage />} />
          <Route path="rsu" element={<RSUTrackerPage />} />
          <Route path="performance" element={<PerformancePage />} />
          <Route path="variable-pay" element={<VariablePayPage />} />
          <Route path="scenarios" element={<ScenarioModelerPage />} />
          <Route path="notifications" element={<NotificationsCenterPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch-all — send to login, ProtectedRoute handles auth check */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  // Single hydration gate at the top level — only ONE loading state for the whole app.
  // Both LoginPage and ProtectedRoute previously had their own _hasHydrated spinners
  // which created a flicker chain. Now there's one spinner here, routes render only
  // after Zustand has fully read from localStorage.
  const _hasHydrated = useAuthStore((s) => s._hasHydrated);

  return (
    <ThemeProvider>
      {!_hasHydrated ? <PageLoader /> : <AppRoutes />}
    </ThemeProvider>
  );
}
