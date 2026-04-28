import { Request, Response, NextFunction } from 'express';
import { appLogsService, LogCategory } from '../services/appLogs.service';

export const appLogsController = {
  async getLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        category,
        userId,
        search,
        from,
        to,
        page = '1',
        limit = '50',
      } = req.query as Record<string, string>;

      const result = await appLogsService.getAll({
        category: category as LogCategory | undefined,
        userId,
        search,
        from,
        to,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await appLogsService.getStats();
      res.json({ data: stats });
    } catch (err) {
      next(err);
    }
  },

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const users = await appLogsService.getUsers();
      res.json({ data: users });
    } catch (err) {
      next(err);
    }
  },
};
