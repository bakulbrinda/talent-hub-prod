import { prisma } from '../lib/prisma';
import { NotificationType, NotificationSeverity } from '@prisma/client';

export const notificationService = {
  getAll: async (filters?: { isRead?: boolean; type?: string; page?: number; limit?: number }) => {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: {
          ...(filters?.isRead !== undefined && { isRead: filters.isRead }),
          ...(filters?.type && { type: filters.type as NotificationType }),
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({
        where: {
          ...(filters?.isRead !== undefined && { isRead: filters.isRead }),
          ...(filters?.type && { type: filters.type as NotificationType }),
        },
      }),
    ]);
    return { data: notifications, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },

  getSummary: async () => {
    const [unread, critical] = await Promise.all([
      prisma.notification.count({ where: { isRead: false } }),
      prisma.notification.count({ where: { isRead: false, severity: 'CRITICAL' } }),
    ]);
    return { unread, critical };
  },

  markRead: async (id: string) =>
    prisma.notification.update({ where: { id }, data: { isRead: true } }),

  markAllRead: async () =>
    prisma.notification.updateMany({ where: { isRead: false }, data: { isRead: true } }),

  create: async (data: {
    type: NotificationType;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    relatedEntityType?: string;
    relatedEntityId?: string;
    metadata?: any;
  }) => prisma.notification.create({ data: { ...data, severity: data.severity || 'INFO' } }),

  delete: async (id: string) =>
    prisma.notification.delete({ where: { id } }),
};
