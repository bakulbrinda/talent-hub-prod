import { Request, Response, NextFunction } from 'express';
import { importService } from '../services/import.service';

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

      if (rows.length > 1000) {
        res.status(400).json({ error: { code: 'TOO_LARGE', message: 'File exceeds 1000 rows limit. Please split into smaller files.' } });
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
        console.error('Import processing error:', err);
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
};
