import { Request, Response, NextFunction } from 'express';
import { importService } from '../services/import.service';
import { benefitsImportService } from '../services/benefitsImport.service';
import logger from '../lib/logger';

export const importController = {
  importEmployees: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded. Please attach a CSV or Excel file.' } });
        return;
      }

      const mode = (req.query.mode as string) === 'replace' ? 'replace' : 'upsert';

      const { rows, detectedColumns } = importService.parseFile(req.file.buffer, req.file.mimetype);

      if (rows.length === 0) {
        res.status(400).json({ error: { code: 'EMPTY_FILE', message: 'The uploaded file contains no data rows.' } });
        return;
      }

      if (rows.length > 5000) {
        res.status(400).json({ error: { code: 'TOO_LARGE', message: 'File exceeds 5000 rows. Please split into smaller files.' } });
        return;
      }

      // Respond immediately — processing happens async via Socket.io
      res.status(202).json({
        message: `Processing ${rows.length} employees${mode === 'replace' ? ' (replace mode: existing data will be cleared)' : ''}. Watch progress via real-time updates.`,
        total: rows.length,
        mode,
      });

      // Process asynchronously
      importService.processImport(rows, { mode, detectedColumns }).catch((err) => {
        logger.error('Import processing error:', err);
      });
    } catch (e) {
      next(e);
    }
  },

  downloadTemplate: (_req: Request, res: Response, next: NextFunction) => {
    try {
      const csv = importService.generateTemplate();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.csv"');
      res.send(csv);
    } catch (e) {
      next(e);
    }
  },

  importBenefits: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded. Please attach a CSV or Excel file.' } });
        return;
      }
      const rows = benefitsImportService.parseFile(req.file.buffer, req.file.mimetype);
      if (rows.length === 0) {
        res.status(400).json({ error: { code: 'EMPTY_FILE', message: 'The uploaded file contains no data rows.' } });
        return;
      }
      if (rows.length > 15000) {
        res.status(400).json({ error: { code: 'TOO_LARGE', message: 'File exceeds 15000 rows. Please split into smaller files.' } });
        return;
      }
      const mode = (req.query.mode as string) === 'replace' ? 'replace' : 'upsert';

      // Respond immediately — processing in background to avoid Neon connection timeouts
      // on large files (same pattern as employee import).
      res.status(202).json({
        data: {
          message: `Processing ${rows.length} benefit records${mode === 'replace' ? ' (replace mode: all existing benefit records will be cleared)' : ''} in the background.`,
          total: rows.length,
          mode,
        },
      });
      benefitsImportService.processImport(rows, { mode }).catch((err) => {
        logger.error('Benefits import processing error:', err);
      });
    } catch (e) {
      next(e);
    }
  },

  downloadBenefitsTemplate: (_req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = benefitsImportService.generateTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="benefits_import_template.xlsx"');
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  },
};
