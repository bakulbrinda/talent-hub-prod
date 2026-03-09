import { Request, Response, NextFunction } from 'express';
import { HR_STAFF_DEFAULT_PERMISSIONS } from '../types/index';

/**
 * Feature-level access middleware.
 * ADMIN role bypasses all checks unconditionally.
 * For all other roles: checks req.user.permissions (set in JWT).
 * If permissions array is empty, falls back to HR_STAFF_DEFAULT_PERMISSIONS.
 * Usage: router.post('/apply', authenticate, requireAccess('scenario.apply'), ctrl.apply)
 */
export const requireAccess = (feature: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      _res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      return;
    }

    // ADMIN always passes — no feature is restricted for them
    if (user.role === 'ADMIN') {
      next();
      return;
    }

    // Use explicitly stored permissions if set; fall back to HR_STAFF defaults
    const permissions: string[] =
      user.permissions && user.permissions.length > 0
        ? user.permissions
        : HR_STAFF_DEFAULT_PERMISSIONS;

    if (permissions.includes(feature)) {
      next();
      return;
    }

    _res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Access denied. Insufficient permissions.' },
    });
  };
