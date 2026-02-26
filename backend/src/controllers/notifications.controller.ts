import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service';

export const notificationsController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        isRead: req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined,
        type: req.query.type as string | undefined,
      };
      res.json(await notificationService.getAll(filters));
    } catch (e) { next(e); }
  },
  getSummary: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await notificationService.getSummary() }); } catch (e) { next(e); }
  },
  markRead: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await notificationService.markRead(req.params.id) }); } catch (e) { next(e); }
  },
  markAllRead: async (_req: Request, res: Response, next: NextFunction) => {
    try { await notificationService.markAllRead(); res.json({ success: true }); } catch (e) { next(e); }
  },
  deleteOne: async (req: Request, res: Response, next: NextFunction) => {
    try { await notificationService.delete(req.params.id); res.json({ success: true }); } catch (e) { next(e); }
  },
};
