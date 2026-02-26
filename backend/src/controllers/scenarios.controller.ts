import { Request, Response, NextFunction } from 'express';
import { scenariosService } from '../services/scenarios.service';

export const scenariosController = {
  getAll: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await scenariosService.getAll() });
    } catch (e) {
      next(e);
    }
  },

  getById: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const s = await scenariosService.getById(req.params.id);
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
      const createdById = req.user?.userId || 'system';
      res.status(201).json({
        data: await scenariosService.create({ name, description, rules, createdById }),
      });
    } catch (e) {
      next(e);
    }
  },

  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await scenariosService.update(req.params.id, req.body) });
    } catch (e) {
      next(e);
    }
  },

  delete: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await scenariosService.delete(req.params.id);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  },

  run: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await scenariosService.run(req.params.id) });
    } catch (e) {
      next(e);
    }
  },

  apply: async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await scenariosService.apply(req.params.id) });
    } catch (e) {
      next(e);
    }
  },

  analyzeRunResult: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const narrative = await scenariosService.analyzeRunResult(req.body);
      res.json({ data: { narrative } });
    } catch (e) { next(e); }
  },
};
