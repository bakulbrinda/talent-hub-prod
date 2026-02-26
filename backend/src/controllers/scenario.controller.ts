import { Request, Response, NextFunction } from 'express';
import { scenarioService } from '../services/scenario.service';

export const scenarioController = {
  getAll: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await scenarioService.getAll() });
    } catch (e) {
      next(e);
    }
  },

  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const s = await scenarioService.getById(req.params.id);
      if (!s) {
        return res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'Scenario not found' } });
      }
      res.json({ data: s });
    } catch (e) {
      next(e);
    }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, rules } = req.body;
      const userId = req.user?.userId || 'system';
      res.status(201).json({
        data: await scenarioService.create({ name, description, rules, createdBy: userId }),
      });
    } catch (e) {
      next(e);
    }
  },

  run: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await scenarioService.run(req.params.id) });
    } catch (e) {
      next(e);
    }
  },

  apply: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { confirmationToken } = req.body;
      res.json({
        data: await scenarioService.apply(req.params.id, confirmationToken),
      });
    } catch (e) {
      next(e);
    }
  },

  compare: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scenarioIds } = req.body;
      res.json({ data: await scenarioService.compare(scenarioIds) });
    } catch (e) {
      next(e);
    }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await scenarioService.delete(req.params.id);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  },
  analyzeRunResult: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const narrative = await scenarioService.analyzeRunResult(req.body);
      res.json({ data: { narrative } });
    } catch (e) { next(e); }
  },
};
