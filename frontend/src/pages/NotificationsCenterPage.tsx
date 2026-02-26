import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Trash2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { cn, formatRelativeTime } from '../lib/utils';
import { useNotificationStore } from '../store/notificationStore';

const notifApi = {
  getAll: async (filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    const r = await api.get(`/notifications?${params}`);
    return r.data;
  },
  markRead: async (id: string) => {
    const r = await api.patch(`/notifications/${id}/read`);
    return r.data;
  },
  markAllRead: async () => {
    const r = await api.patch('/notifications/mark-all-read');
    return r.data;
  },
  delete: async (id: string) => {
    const r = await api.delete(`/notifications/${id}`);
    return r.data;
  },
};

const SEVERITY_CONFIG = {
  INFO: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200' },
  WARNING: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200' },
  CRITICAL: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200' },
};

type FilterTab = 'ALL' | 'UNREAD' | 'PAY_ANOMALY' | 'BUDGET' | 'RSU';

export default function NotificationsCenterPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const queryClient = useQueryClient();
  const { unreadCount, setUnreadCount } = useNotificationStore();

  const { data: notifsRaw, isLoading } = useQuery({
    queryKey: ['notifications', activeFilter],
    queryFn: () => {
      const filters: Record<string, string> = {};
      if (activeFilter === 'UNREAD') filters.isRead = 'false';
      if (['PAY_ANOMALY', 'BUDGET', 'RSU'].includes(activeFilter)) filters.type = activeFilter;
      return notifApi.getAll(filters);
    },
  });

  const markReadMutation = useMutation({
    mutationFn: notifApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnreadCount(Math.max(0, unreadCount - 1));
    },
  });

  const markAllMutation = useMutation({
    mutationFn: notifApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setUnreadCount(0);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: notifApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = ((notifsRaw as any)?.data || []) as any[];
  const unread = notifications.filter((n: any) => !n.isRead).length;

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'UNREAD', label: `Unread${unread > 0 ? ` (${unread})` : ''}` },
    { key: 'PAY_ANOMALY', label: 'Pay Anomalies' },
    { key: 'BUDGET', label: 'Budget' },
    { key: 'RSU', label: 'RSU' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {unread > 0 ? `${unread} unread notifications` : 'All caught up'}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap',
              activeFilter === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 flex flex-col items-center">
          <Bell className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">No notifications</p>
          <p className="text-xs text-muted-foreground mt-1">
            {activeFilter !== 'ALL' ? 'Try a different filter' : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif: any) => {
            const config =
              SEVERITY_CONFIG[notif.severity as keyof typeof SEVERITY_CONFIG] ||
              SEVERITY_CONFIG.INFO;
            const Icon = config.icon;
            return (
              <div
                key={notif.id}
                className={cn(
                  'rounded-xl border p-4 transition-all',
                  !notif.isRead
                    ? `${config.bg} ${config.border}`
                    : 'bg-card border-border opacity-70'
                )}
              >
                <div className="flex items-start gap-3">
                  <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={cn(
                            'text-sm font-medium',
                            !notif.isRead ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {notif.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{notif.message}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notif.isRead && (
                          <button
                            onClick={() => markReadMutation.mutate(notif.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                            title="Mark as read"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(notif.id)}
                          className="p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          notif.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-700'
                            : notif.severity === 'WARNING'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-blue-100 text-blue-700'
                        )}
                      >
                        {notif.severity}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {notif.type?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
