import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import logger from '../lib/logger';

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // ─── Zod Validation Error ─────────────────────────────────
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  // ─── JWT Errors ───────────────────────────────────────────
  if (err instanceof TokenExpiredError) {
    res.status(401).json({
      error: { code: 'TOKEN_EXPIRED', message: 'Access token has expired' },
    });
    return;
  }

  if (err instanceof JsonWebTokenError) {
    res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Invalid access token' },
    });
    return;
  }

  // ─── Prisma Errors ────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'A record with this value already exists',
          details: { fields: err.meta?.target },
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Related record not found' },
      });
      return;
    }
  }

  // ─── App Error (custom) ───────────────────────────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // ─── Unknown Error ────────────────────────────────────────
  const error = err as Error;
  logger.error('Unhandled error:', { message: error.message, stack: error.stack });

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
    },
  });
};

// ─── Custom App Error ─────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (resource: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const unauthorized = (msg = 'Unauthorized'): AppError =>
  new AppError(401, 'UNAUTHORIZED', msg);

export const forbidden = (msg = 'Forbidden'): AppError =>
  new AppError(403, 'FORBIDDEN', msg);

export const badRequest = (msg: string): AppError =>
  new AppError(400, 'BAD_REQUEST', msg);
