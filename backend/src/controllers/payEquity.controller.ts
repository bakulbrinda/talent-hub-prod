import { Request, Response, NextFunction } from 'express';
import { payEquityService } from '../services/payEquity.service';

export const payEquityController = {
  getGenderPayGap: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { department, band } = req.query as Record<string, string>;
      res.json({ data: await payEquityService.getGenderPayGap({ department, band }) });
    } catch (e) { next(e); }
  },
  getCompaRatioDistribution: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { band, department } = req.query as Record<string, string>;
      res.json({ data: await payEquityService.getCompaRatioDistribution({ band, department }) });
    } catch (e) { next(e); }
  },
  getHeatmap: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await payEquityService.getHeatmap() }); } catch (e) { next(e); }
  },
  getScore: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await payEquityService.getScore() }); } catch (e) { next(e); }
  },
  getOutliers: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await payEquityService.getOutliers() }); } catch (e) { next(e); }
  },
  getNewHireParity: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await payEquityService.getNewHireParity() }); } catch (e) { next(e); }
  },
};
