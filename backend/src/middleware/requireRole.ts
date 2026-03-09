import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '../types/index';

/**
 * requireRole — Role-based access control middleware.
 * Must be used AFTER the `authenticate` middleware (which populates req.user).
 *
 * Usage:
 *   router.post('/apply', authenticate, requireRole('ADMIN'), applyHandler);
 *   router.post('/import', authenticate, requireRole('ADMIN', 'HR_MANAGER'), importHandler);
 */
export const requireRole = (...roles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role as UserRole | undefined;
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Insufficient permissions.',
        },
      });
      return;
    }
    next();
  };
