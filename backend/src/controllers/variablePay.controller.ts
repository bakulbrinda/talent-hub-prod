import { Request, Response, NextFunction } from 'express';
import { variablePayService } from '../services/variablePay.service';

export const variablePayController = {
  getPlans: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await variablePayService.getPlans() });
    } catch (e) {
      next(e);
    }
  },

  createPlan: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json({ data: await variablePayService.createPlan(req.body) });
    } catch (e) {
      next(e);
    }
  },

  updatePlan: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        data: await variablePayService.updatePlan(req.params.id, req.body),
      });
    } catch (e) {
      next(e);
    }
  },

  getAchievements: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        data: await variablePayService.getAchievements(req.query as Record<string, string>),
      });
    } catch (e) {
      next(e);
    }
  },

  calculatePayout: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { employeeId, planId, achievedAmount } = req.body;
      res.json({
        data: await variablePayService.calculatePayout(
          employeeId,
          planId,
          Number(achievedAmount),
        ),
      });
    } catch (e) {
      next(e);
    }
  },

  saveAchievement: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(201).json({ data: await variablePayService.saveAchievement(req.body) });
    } catch (e) { next(e); }
  },

  getAnalytics: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await variablePayService.getAnalytics() });
    } catch (e) {
      next(e);
    }
  },
  getAIAnalysis: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const narrative = await variablePayService.analyzeWithAI();
      res.json({ data: { narrative } });
    } catch (e) { next(e); }
  },
};
