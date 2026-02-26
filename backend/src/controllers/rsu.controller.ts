import { Request, Response, NextFunction } from 'express';
import { rsuService } from '../services/rsu.service';

export const rsuController = {
  getGrants: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await rsuService.getGrants(req.query as any) }); } catch (e) { next(e); }
  },
  createGrant: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await rsuService.createGrant(req.body) }); } catch (e) { next(e); }
  },
  getVestingSchedule: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await rsuService.getVestingSchedule() }); } catch (e) { next(e); }
  },
  getEligibilityGap: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await rsuService.getEligibilityGap() }); } catch (e) { next(e); }
  },
  getSummary: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await rsuService.getSummary() }); } catch (e) { next(e); }
  },
  getAIAnalysis: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const narrative = await rsuService.analyzeWithAI();
      res.json({ data: { narrative } });
    } catch (e) { next(e); }
  },
};
