import { Request, Response, NextFunction } from 'express';
import { salaryBandService } from '../services/salaryBand.service';

export const salaryBandController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await salaryBandService.getAll(req.query as any) }); } catch (e) { next(e); }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await salaryBandService.create(req.body) }); } catch (e) { next(e); }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await salaryBandService.update(req.params.id, req.body) }); } catch (e) { next(e); }
  },
  getMarketBenchmarks: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await salaryBandService.getMarketBenchmarks(req.query as any) }); } catch (e) { next(e); }
  },
  getOutliers: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await salaryBandService.getOutliers() }); } catch (e) { next(e); }
  },
};
