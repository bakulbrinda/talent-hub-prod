import { Request, Response, NextFunction } from 'express';
import { aiInsightsService } from '../services/aiInsights.service';

export const aiInsightsController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { insightType, page, limit } = req.query as Record<string, string>;
      res.json(await aiInsightsService.getAll(insightType, Number(page) || 1, Number(limit) || 10));
    } catch (e) { next(e); }
  },

  getOrGenerate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { type } = req.params;
      const filters = req.query as Record<string, string>;
      const insight = await aiInsightsService.getOrGenerate(type.toUpperCase(), filters);
      res.json({ data: insight });
    } catch (e) { next(e); }
  },

  generate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { insightType, filters } = req.body;
      const insight = await aiInsightsService.getOrGenerate(insightType, filters);
      res.json({ data: insight });
    } catch (e) { next(e); }
  },

  invalidate: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await aiInsightsService.invalidate(req.params.id);
      res.json({ success: true });
    } catch (e) { next(e); }
  },

  getDashboardSummary: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await aiInsightsService.getDashboardSummary();
      res.json({ data: { summary } });
    } catch (e) { next(e); }
  },
};
