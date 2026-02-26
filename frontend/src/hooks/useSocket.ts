import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getSocket, initSocket, disconnectSocket } from '../lib/socket';
import { useAuthStore } from '../store/authStore';
import { useNotificationStore } from '../store/notificationStore';
import { queryKeys } from '../lib/queryClient';
import type { Notification } from '@shared/types/index';

export function useSocket() {
  const { accessToken, isAuthenticated } = useAuthStore();
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;

    const socket = initSocket(accessToken);

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
    });

    socket.on('notification:new', (notification: Notification) => {
      addNotification(notification);
      toast.info(notification.title, {
        description: notification.message,
        duration: 5000,
      });
    });

    socket.on('notification:critical', (notification: Notification) => {
      addNotification(notification);
      toast.error(notification.title, {
        description: notification.message,
        duration: 10000,
      });
    });

    socket.on('pay:anomaly', (payload: { employee: { firstName: string; lastName: string }; band: string; delta: number }) => {
      toast.warning(`Pay Anomaly Detected`, {
        description: `${payload.employee.firstName} ${payload.employee.lastName} is outside band ${payload.band}`,
        duration: 8000,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.employees.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.payEquity.heatmap });
    });

    socket.on('budget:threshold', (payload: { department: string; used: number; limit: number }) => {
      toast.warning(`Budget Alert: ${payload.department}`, {
        description: `${((payload.used / payload.limit) * 100).toFixed(0)}% of budget consumed`,
        duration: 8000,
      });
    });

    socket.on('rsu:vesting', (payload: { employee: { firstName: string; lastName: string }; units: number }) => {
      toast.success(`RSU Vesting Event`, {
        description: `${payload.employee.firstName} ${payload.employee.lastName} — ${payload.units} units vested`,
        duration: 6000,
      });
    });

    // Invalidate every dashboard query key, not just kpis + bandDistribution.
    socket.on('dashboard:refresh', () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    });

    // New employee created — refresh employees list plus every module whose
    // aggregates (compa-ratio bands, pay gaps, salary outliers) just changed.
    socket.on('employee:created', (payload: { employee: { firstName: string; lastName: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      toast.success(`New employee added: ${payload.employee.firstName} ${payload.employee.lastName}`, { duration: 4000 });
    });

    // Employee record edited — compa-ratio, pay gap, band outliers may all shift.
    socket.on('employee:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    });

    // Bulk import complete — full refresh of every data-dependent module.
    socket.on('import:complete', (payload: { imported: number; failed: number }) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['ai-insights'] });
      if (payload.imported > 0) {
        toast.success(`Bulk import finished: ${payload.imported} employees added`, { duration: 5000 });
      }
    });

    // Emitted by employee.service after any create/update — catches cases where
    // the specific 'employee:created' / 'employee:updated' events aren't enough.
    socket.on('employee:data:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    });

    // Emitted when a SalaryBand record is updated (feat-008).
    // Compa-ratios for every employee in that band become stale.
    socket.on('salary:band:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['pay-equity'] });
      queryClient.invalidateQueries({ queryKey: ['salary-bands'] });
    });

    return () => {
      socket.off('notification:new');
      socket.off('notification:critical');
      socket.off('pay:anomaly');
      socket.off('budget:threshold');
      socket.off('rsu:vesting');
      socket.off('dashboard:refresh');
      socket.off('employee:created');
      socket.off('employee:updated');
      socket.off('import:complete');
      socket.off('employee:data:changed');
      socket.off('salary:band:updated');
    };
  }, [isAuthenticated, accessToken]);

  useEffect(() => {
    return () => {
      if (!isAuthenticated) {
        disconnectSocket();
      }
    };
  }, [isAuthenticated]);
}
