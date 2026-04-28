/**
 * appLogs.service.ts
 * Unified application log service — merges AuditLog + MailLog into a single
 * admin-only activity feed. ADMIN-gated at the route level.
 */

import { prisma } from '../lib/prisma';

export type LogCategory = 'AUTH' | 'DATA' | 'EMAIL' | 'USER_MGMT' | 'SYSTEM';

/** Action string → category mapping */
const ACTION_CATEGORY_MAP: Record<string, LogCategory> = {
  LOGIN_SUCCESS: 'AUTH',
  LOGIN_FAILED: 'AUTH',
  LOGOUT: 'AUTH',
  PASSWORD_CHANGED: 'AUTH',
  SESSION_REVOKED: 'AUTH',
  TOKEN_REFRESHED: 'AUTH',
  USER_INVITED: 'USER_MGMT',
  INVITE_ACCEPTED: 'USER_MGMT',
  ROLE_CHANGED: 'USER_MGMT',
  USER_ACTIVATED: 'USER_MGMT',
  USER_DEACTIVATED: 'USER_MGMT',
  PERMISSIONS_UPDATED: 'USER_MGMT',
  USER_DELETED: 'USER_MGMT',
  AI_SCAN_TRIGGERED: 'SYSTEM',
  SETTINGS_UPDATED: 'SYSTEM',
  CACHE_CLEARED: 'SYSTEM',
  EXPORT_GENERATED: 'SYSTEM',
};

function categorise(action: string): LogCategory {
  if (ACTION_CATEGORY_MAP[action]) return ACTION_CATEGORY_MAP[action];
  if (
    action.startsWith('EMPLOYEE_') ||
    action.startsWith('SCENARIO_') ||
    action.startsWith('SALARY_BAND_') ||
    action.startsWith('IMPORT_') ||
    action.startsWith('PERFORMANCE_') ||
    action.startsWith('BENEFIT_')
  )
    return 'DATA';
  return 'SYSTEM';
}

export interface UnifiedLog {
  id: string;
  source: 'audit' | 'mail';
  category: LogCategory;
  timestamp: string;
  user: { id: string; name: string; email: string; role: string } | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  // Mail-specific
  recipientEmail?: string;
  subject?: string;
  useCase?: string;
}

interface GetAllFilters {
  category?: LogCategory;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const appLogsService = {
  async getAll(filters: GetAllFilters = {}) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const skip = (page - 1) * limit;

    const dateFilter =
      filters.from || filters.to
        ? {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to ? new Date(new Date(filters.to).setHours(23, 59, 59, 999)) : undefined,
          }
        : undefined;

    // ── EMAIL only ──────────────────────────────────────────────
    if (filters.category === 'EMAIL') {
      const [mailLogs, total] = await Promise.all([
        prisma.mailLog.findMany({
          where: {
            ...(filters.userId && { sentById: filters.userId }),
            ...(filters.search && {
              OR: [
                { subject: { contains: filters.search, mode: 'insensitive' } },
                { useCase: { contains: filters.search, mode: 'insensitive' } },
                { recipientEmail: { contains: filters.search, mode: 'insensitive' } },
              ],
            }),
            ...(dateFilter && { sentAt: dateFilter }),
          },
          include: { sentBy: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { sentAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.mailLog.count({
          where: {
            ...(filters.userId && { sentById: filters.userId }),
            ...(filters.search && {
              OR: [
                { subject: { contains: filters.search, mode: 'insensitive' } },
                { useCase: { contains: filters.search, mode: 'insensitive' } },
                { recipientEmail: { contains: filters.search, mode: 'insensitive' } },
              ],
            }),
            ...(dateFilter && { sentAt: dateFilter }),
          },
        }),
      ]);

      const mapped: UnifiedLog[] = mailLogs.map(m => ({
        id: m.id,
        source: 'mail',
        category: 'EMAIL',
        timestamp: m.sentAt.toISOString(),
        user: m.sentBy,
        action: 'EMAIL_SENT',
        recipientEmail: m.recipientEmail,
        subject: m.subject,
        useCase: m.useCase,
      }));

      return { data: mapped, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    // ── Non-EMAIL categories (AuditLog only) ───────────────────
    // At this point filters.category is narrowed away from 'EMAIL' by the early return above.
    if (filters.category) {
      const activeCategory = filters.category as Exclude<LogCategory, 'EMAIL'>;
      const actionsForCategory = Object.entries(ACTION_CATEGORY_MAP)
        .filter(([, cat]) => cat === activeCategory)
        .map(([action]) => action);

      const [auditLogs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where: {
            ...(filters.userId && { userId: filters.userId }),
            ...(actionsForCategory.length > 0 && {
              OR: [
                { action: { in: actionsForCategory } },
                ...(activeCategory === 'DATA'
                  ? [
                      { action: { startsWith: 'EMPLOYEE_' } },
                      { action: { startsWith: 'SCENARIO_' } },
                      { action: { startsWith: 'SALARY_BAND_' } },
                      { action: { startsWith: 'IMPORT_' } },
                      { action: { startsWith: 'PERFORMANCE_' } },
                      { action: { startsWith: 'BENEFIT_' } },
                    ]
                  : []),
              ],
            }),
            ...(filters.search && { action: { contains: filters.search, mode: 'insensitive' } }),
            ...(dateFilter && { createdAt: dateFilter }),
          },
          include: { user: { select: { id: true, name: true, email: true, role: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({
          where: {
            ...(filters.userId && { userId: filters.userId }),
            ...(actionsForCategory.length > 0 && {
              OR: [
                { action: { in: actionsForCategory } },
                ...(activeCategory === 'DATA'
                  ? [
                      { action: { startsWith: 'EMPLOYEE_' } },
                      { action: { startsWith: 'SCENARIO_' } },
                      { action: { startsWith: 'SALARY_BAND_' } },
                      { action: { startsWith: 'IMPORT_' } },
                      { action: { startsWith: 'PERFORMANCE_' } },
                      { action: { startsWith: 'BENEFIT_' } },
                    ]
                  : []),
              ],
            }),
            ...(filters.search && { action: { contains: filters.search, mode: 'insensitive' } }),
            ...(dateFilter && { createdAt: dateFilter }),
          },
        }),
      ]);

      const mapped: UnifiedLog[] = auditLogs.map(a => ({
        id: a.id,
        source: 'audit',
        category: categorise(a.action),
        timestamp: a.createdAt.toISOString(),
        user: a.user,
        action: a.action,
        entityType: a.entityType,
        entityId: a.entityId,
        metadata: a.metadata as Record<string, unknown> | null,
        ip: a.ip,
      }));

      return { data: mapped, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    }

    // ── ALL categories — fetch from both tables, merge ──────────
    const auditWhere = {
      ...(filters.userId && { userId: filters.userId }),
      ...(filters.search && { action: { contains: filters.search, mode: 'insensitive' as const } }),
      ...(dateFilter && { createdAt: dateFilter }),
    };
    const mailWhere = {
      ...(filters.userId && { sentById: filters.userId }),
      ...(filters.search && {
        OR: [
          { subject: { contains: filters.search, mode: 'insensitive' as const } },
          { useCase: { contains: filters.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(dateFilter && { sentAt: dateFilter }),
    };

    // Cap at 5000 rows per source before in-memory merge + pagination.
    // Per-source skip/take before merging gives incorrect cross-source page results,
    // so we fetch a bounded window, merge-sort, then slice.
    const MERGE_CAP = 5000;

    const [auditLogs, mailLogs, auditTotal, mailTotal] = await Promise.all([
      prisma.auditLog.findMany({
        where: auditWhere,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: MERGE_CAP,
      }),
      prisma.mailLog.findMany({
        where: mailWhere,
        include: { sentBy: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { sentAt: 'desc' },
        take: MERGE_CAP,
      }),
      prisma.auditLog.count({ where: auditWhere }),
      prisma.mailLog.count({ where: mailWhere }),
    ]);

    const total = auditTotal + mailTotal;

    const auditMapped: UnifiedLog[] = auditLogs.map(a => ({
      id: a.id,
      source: 'audit',
      category: categorise(a.action),
      timestamp: a.createdAt.toISOString(),
      user: a.user,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      metadata: a.metadata as Record<string, unknown> | null,
      ip: a.ip,
    }));

    const mailMapped: UnifiedLog[] = mailLogs.map(m => ({
      id: m.id,
      source: 'mail',
      category: 'EMAIL' as LogCategory,
      timestamp: m.sentAt.toISOString(),
      user: m.sentBy,
      action: 'EMAIL_SENT',
      recipientEmail: m.recipientEmail,
      subject: m.subject,
      useCase: m.useCase,
    }));

    // Merge all records, sort by timestamp desc, then paginate in memory
    // (doing per-source skip/take before merging produces incorrect page results)
    const merged = [...auditMapped, ...mailMapped]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(skip, skip + limit);

    return {
      data: merged,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  /** Today's stats for the KPI cards */
  async getStats() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalToday, authToday, dataToday, emailToday] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: todayStart },
          action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED', 'SESSION_REVOKED'] },
        },
      }),
      prisma.auditLog.count({
        where: {
          createdAt: { gte: todayStart },
          OR: [
            { action: { startsWith: 'EMPLOYEE_' } },
            { action: { startsWith: 'SCENARIO_' } },
            { action: { startsWith: 'IMPORT_' } },
          ],
        },
      }),
      prisma.mailLog.count({ where: { sentAt: { gte: todayStart } } }),
    ]);

    return { totalToday, authToday, dataToday, emailToday };
  },

  /** Distinct users list for the user filter dropdown */
  async getUsers() {
    return prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  },
};
