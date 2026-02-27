import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service';

export const dashboardController = {
  getKpis: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getKpis() }); } catch (e) { next(e); }
  },
  getBandDistribution: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getBandDistribution() }); } catch (e) { next(e); }
  },
  getSalaryDistribution: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getSalaryDistribution() }); } catch (e) { next(e); }
  },
  getCompensationTrend: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getCompensationTrend() }); } catch (e) { next(e); }
  },
  getPayEquitySummary: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getPayEquitySummary() }); } catch (e) { next(e); }
  },
  getAiSummary: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { aiInsightsService } = await import('../services/aiInsights.service');
      const summary = await aiInsightsService.getDashboardSummary();
      res.json({ data: { summary } });
    } catch (e) { next(e); }
  },
  getCompVsPerformancePlot: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getCompVsPerformancePlot() }); } catch (e) { next(e); }
  },
  getDeptPayEquityHeatmap: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getDeptPayEquityHeatmap() }); } catch (e) { next(e); }
  },
  getRsuVestingTimeline: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getRsuVestingTimeline() }); } catch (e) { next(e); }
  },
  getAttritionRiskDistribution: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getAttritionRiskDistribution() }); } catch (e) { next(e); }
  },
  getActionRequired: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await dashboardService.getActionRequired() }); } catch (e) { next(e); }
  },
};
