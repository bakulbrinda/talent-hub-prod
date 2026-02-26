import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { pubClient, subClient } from './redis';
import logger from './logger';
import type {
  SocketNotificationPayload,
  SocketPayAnomalyPayload,
  SocketBudgetThresholdPayload,
  SocketRsuVestingPayload,
} from '../types/index';
import { SOCKET_EVENTS } from '../types/index';

let io: SocketServer;

export const initializeSocket = (server: HttpServer): SocketServer => {
  // Tunnel mode: no FRONTEND_URL set → allow all origins for demo sharing.
  // Production: restrict to FRONTEND_URL.
  const socketOrigin = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, 'http://localhost:5173']
    : true;

  io = new SocketServer(server, {
    cors: {
      origin: socketOrigin,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Attach Redis adapter for horizontal scaling
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.io Redis adapter attached');
    })
    .catch((err) => {
      logger.warn('Socket.io Redis adapter failed, using in-memory adapter:', err.message);
    });

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
};

export const getIO = (): SocketServer => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// ─── Typed Emit Helpers ───────────────────────────────────────
export const emitNotification = (payload: SocketNotificationPayload): void => {
  try {
    const ioInstance = getIO();
    ioInstance.emit(SOCKET_EVENTS.NOTIFICATION_NEW, payload);
    if (payload.notification.severity === 'CRITICAL') {
      ioInstance.emit(SOCKET_EVENTS.NOTIFICATION_CRITICAL, payload);
    }
  } catch (err) {
    logger.error('Failed to emit notification:', err);
  }
};

export const emitPayAnomaly = (payload: SocketPayAnomalyPayload): void => {
  try {
    getIO().emit(SOCKET_EVENTS.PAY_ANOMALY, payload);
  } catch (err) {
    logger.error('Failed to emit pay anomaly:', err);
  }
};

export const emitBudgetAlert = (payload: SocketBudgetThresholdPayload): void => {
  try {
    getIO().emit(SOCKET_EVENTS.BUDGET_THRESHOLD, payload);
  } catch (err) {
    logger.error('Failed to emit budget alert:', err);
  }
};

export const emitRsuVesting = (payload: SocketRsuVestingPayload): void => {
  try {
    getIO().emit(SOCKET_EVENTS.RSU_VESTING, payload);
  } catch (err) {
    logger.error('Failed to emit RSU vesting:', err);
  }
};

export const emitDashboardRefresh = (): void => {
  try {
    getIO().emit(SOCKET_EVENTS.DASHBOARD_REFRESH, {});
  } catch (err) {
    logger.error('Failed to emit dashboard refresh:', err);
  }
};

export const emitEmployeeCreated = (employee: Record<string, unknown>): void => {
  try {
    getIO().emit(SOCKET_EVENTS.EMPLOYEE_CREATED, { employee });
  } catch (err) {
    logger.error('Failed to emit employee:created:', err);
  }
};

export const emitEmployeeUpdated = (employee: Record<string, unknown>): void => {
  try {
    getIO().emit(SOCKET_EVENTS.EMPLOYEE_UPDATED, { employee });
  } catch (err) {
    logger.error('Failed to emit employee:updated:', err);
  }
};

export const emitEmployeeDataChanged = (): void => {
  try {
    getIO().emit(SOCKET_EVENTS.EMPLOYEE_DATA_CHANGED, {});
  } catch (err) {
    logger.error('Failed to emit employee:data:changed:', err);
  }
};

export const emitSalaryBandUpdated = (): void => {
  try {
    getIO().emit(SOCKET_EVENTS.SALARY_BAND_UPDATED, {});
  } catch (err) {
    logger.error('Failed to emit salary:band:updated:', err);
  }
};

export const emitEmployeeImportProgress = (payload: { processed: number; total: number; errors: unknown[] }): void => {
  try {
    getIO().emit(SOCKET_EVENTS.IMPORT_PROGRESS, payload);
  } catch (err) {
    logger.error('Failed to emit import:progress:', err);
  }
};

export const emitEmployeeImportComplete = (payload: { imported: number; failed: number; errors: unknown[] }): void => {
  try {
    getIO().emit(SOCKET_EVENTS.IMPORT_COMPLETE, payload);
  } catch (err) {
    logger.error('Failed to emit import:complete:', err);
  }
};
