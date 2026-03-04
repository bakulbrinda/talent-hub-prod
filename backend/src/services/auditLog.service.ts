/**
 * auditLog — lightweight wrapper around AuditLog Prisma model.
 * Call logAction() after any sensitive operation.
 * Fire-and-forget is intentional — audit failures must never block the main action.
 */

import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

export interface AuditLogEntry {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function logAction(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        ...entry,
        metadata: entry.metadata as any,
      },
    });
  } catch (err) {
    // Never let audit log failures surface to the caller
    logger.warn('[AuditLog] Failed to write log entry:', err);
  }
}

export const auditLogService = {
  getAll: async (filters?: { userId?: string; action?: string; page?: number; limit?: number }) => {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          ...(filters?.userId && { userId: filters.userId }),
          ...(filters?.action && { action: { contains: filters.action, mode: 'insensitive' as const } }),
        },
        include: {
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({
        where: {
          ...(filters?.userId && { userId: filters.userId }),
          ...(filters?.action && { action: { contains: filters.action, mode: 'insensitive' as const } }),
        },
      }),
    ]);
    return { data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  },
};
