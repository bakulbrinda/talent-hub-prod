import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      const result = await authService.login(email, password, ip);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = refreshSchema.parse(req.body);
      const result = await authService.refresh(refreshToken);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
      if (refreshToken) await authService.logout(refreshToken, ip);
      res.json({ data: { message: 'Logged out successfully' } });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const user = await authService.getMe(userId);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const result = await authService.changePassword(req.user!.userId, currentPassword, newPassword);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name is required' } });
      const user = await authService.updateName(req.user!.userId, name);
      res.json({ data: user });
    } catch (err) {
      next(err);
    }
  },

  async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const sessions = await authService.getSessions(req.user!.userId);
      res.json({ data: sessions });
    } catch (err) {
      next(err);
    }
  },

  async revokeAllSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.revokeAllSessions(req.user!.userId);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  },
};
