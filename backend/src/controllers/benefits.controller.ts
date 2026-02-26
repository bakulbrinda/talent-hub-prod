import { Request, Response, NextFunction } from 'express';
import { benefitsService } from '../services/benefits.service';
import multer from 'multer';

export const benefitsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export const benefitsController = {
  getCatalog: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await benefitsService.getCatalog() }); } catch (e) { next(e); }
  },
  getUtilization: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await benefitsService.getUtilization() }); } catch (e) { next(e); }
  },
  getEnrollments: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await benefitsService.getEnrollments(req.query as any) }); } catch (e) { next(e); }
  },
  checkEligibility: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { employeeId, benefitId } = req.params;
      res.json({ data: await benefitsService.checkEligibility(employeeId, benefitId) });
    } catch (e) { next(e); }
  },
  enroll: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { employeeId, benefitId } = req.body;
      res.json({ data: await benefitsService.enroll(employeeId, benefitId) });
    } catch (e) { next(e); }
  },
  getCategorySummary: async (_req: Request, res: Response, next: NextFunction) => {
    try { res.json({ data: await benefitsService.getCategorySummary() }); } catch (e) { next(e); }
  },

  getAIAnalysis: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const narrative = await benefitsService.analyzeWithAI();
      res.json({ data: { narrative } });
    } catch (e) { next(e); }
  },

  importData: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded.' } });
        return;
      }
      const result = await benefitsService.importUtilizationData(req.file.buffer, req.file.mimetype);
      res.json({ data: result });
    } catch (e) { next(e); }
  },
};
