import { Request, Response, NextFunction } from 'express';
import { employeeService } from '../services/employee.service';
import { emitEmployeeCreated, emitEmployeeUpdated } from '../lib/socket';

export const employeeController = {
  getAll: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        search: req.query.search as string | undefined,
        band: req.query.band as string | undefined,
        department: req.query.department as string | undefined,
        gender: req.query.gender as string | undefined,
        workMode: req.query.workMode as string | undefined,
      };
      const result = await employeeService.getAll(filters);
      res.json(result);
    } catch (e) { next(e); }
  },
  getById: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await employeeService.getById(req.params.id) }); } catch (e) { next(e); }
  },
  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await employeeService.create(req.body);
      emitEmployeeCreated(employee as unknown as Record<string, unknown>);
      res.status(201).json({ data: employee });
    } catch (e) { next(e); }
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const employee = await employeeService.update(req.params.id, req.body);
      emitEmployeeUpdated(employee as unknown as Record<string, unknown>);
      res.json({ data: employee });
    } catch (e) { next(e); }
  },
  getAnalytics: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await employeeService.getAnalytics() }); } catch (e) { next(e); }
  },
};
