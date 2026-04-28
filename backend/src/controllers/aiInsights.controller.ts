import { Request, Response, NextFunction } from 'express';
import { aiInsightsService } from '../services/aiInsights.service';

export const aiInsightsController = {
  getDashboardSummary: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await aiInsightsService.getDashboardSummary();
      res.json({ data: { summary } });
    } catch (e) { next(e); }
  },
};
