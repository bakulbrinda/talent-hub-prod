import { Request, Response, NextFunction } from 'express';
import { performanceService } from '../services/performance.service';

export const performanceController = {
  getRatings: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await performanceService.getRatings(req.query as any) }); } catch (e) { next(e); }
  },
  createRating: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await performanceService.createRating(req.body) }); } catch (e) { next(e); }
  },
  getMatrix: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await performanceService.getMatrix() }); } catch (e) { next(e); }
  },
  getPromotionReadiness: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await performanceService.getPromotionReadiness() }); } catch (e) { next(e); }
  },
  getPayAlignmentGaps: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await performanceService.getPayAlignmentGaps() }); } catch (e) { next(e); }
  },
  getCycles: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await performanceService.getCycles() }); } catch (e) { next(e); }
  },
  getAIAnalysis: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const narrative = await performanceService.analyzeWithAI();
      res.json({ data: { narrative } });
    } catch (e) { next(e); }
  },
};
