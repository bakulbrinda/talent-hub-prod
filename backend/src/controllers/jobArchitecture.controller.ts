import { Request, Response, NextFunction } from 'express';
import { jobArchitectureService } from '../services/jobArchitecture.service';

export const jobArchitectureController = {
  getHierarchy: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getHierarchy() }); } catch (e) { next(e); }
  },
  getJobAreas: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getJobAreas() }); } catch (e) { next(e); }
  },
  createJobArea: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await jobArchitectureService.createJobArea(req.body) }); } catch (e) { next(e); }
  },
  updateJobArea: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.updateJobArea(req.params.id, req.body) }); } catch (e) { next(e); }
  },
  getJobFamilies: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getJobFamilies(req.query.jobAreaId as string) }); } catch (e) { next(e); }
  },
  createJobFamily: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await jobArchitectureService.createJobFamily(req.body) }); } catch (e) { next(e); }
  },
  getBands: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getBands() }); } catch (e) { next(e); }
  },
  createBand: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await jobArchitectureService.createBand(req.body) }); } catch (e) { next(e); }
  },
  getGrades: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getGrades(req.query.bandId as string) }); } catch (e) { next(e); }
  },
  getJobCodes: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { bandId, jobFamilyId } = req.query as Record<string, string>;
      res.json({ data: await jobArchitectureService.getJobCodes({ bandId, jobFamilyId }) });
    } catch (e) { next(e); }
  },
  createJobCode: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await jobArchitectureService.createJobCode(req.body) }); } catch (e) { next(e); }
  },
  getSkills: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.getSkills() }); } catch (e) { next(e); }
  },
  createSkill: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json({ data: await jobArchitectureService.createSkill(req.body) }); } catch (e) { next(e); }
  },
  updateSkill: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await jobArchitectureService.updateSkill(req.params.id, req.body) }); } catch (e) { next(e); }
  },
};
