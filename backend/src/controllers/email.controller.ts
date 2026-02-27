import { Request, Response, NextFunction } from 'express';
import { emailService } from '../services/email.service';

export const emailController = {
  sendLowPerformerAlerts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const threshold = req.body.ratingThreshold ? Number(req.body.ratingThreshold) : 3.0;
      const result = await emailService.sendLowPerformerAlerts(threshold);
      res.json({ data: result });
    } catch (e) { next(e); }
  },

  sendPayAnomalyAlert: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await emailService.sendPayAnomalyAlert();
      res.json({ data: result });
    } catch (e) { next(e); }
  },

  sendRsuCliffReminders: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await emailService.sendRsuCliffReminders();
      res.json({ data: result });
    } catch (e) { next(e); }
  },
};
