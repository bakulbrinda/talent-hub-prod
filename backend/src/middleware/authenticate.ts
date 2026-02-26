import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from './errorHandler';

export interface JwtPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(unauthorized('No token provided'));
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret') as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    next(err); // Passes to errorHandler (TokenExpiredError or JsonWebTokenError)
  }
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') {
    return next(unauthorized('Admin access required'));
  }
  next();
};
