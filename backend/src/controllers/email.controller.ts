import { Request, Response, NextFunction } from 'express';
import { emailService } from '../services/email.service';
import { callClaude } from '../lib/claudeClient';
import { prisma } from '../lib/prisma';

export const emailController = {
  sendLowPerformerAlerts: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const threshold = req.body.ratingThreshold ? Number(req.body.ratingThreshold) : 3.0;
      const result = await emailService.sendLowPerformerAlerts(threshold);
      if (result.sent > 0) {
        await prisma.mailLog.create({
          data: {
            sentById: req.user!.userId,
            recipientEmail: `${result.sent} manager(s)`,
            subject: `[Bulk] Low performer alerts — threshold ${threshold}/5`,
            body: `Sent to ${result.sent} of ${result.managerCount} managers. ${result.skipped} skipped (no email).`,
            useCase: 'low_performer_alert',
          },
        }).catch(() => {});
      }
      res.json({ data: result });
    } catch (e) { next(e); }
  },

  sendPayAnomalyAlert: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await emailService.sendPayAnomalyAlert();
      if (result.sent > 0) {
        await prisma.mailLog.create({
          data: {
            sentById: req.user!.userId,
            recipientEmail: process.env.HR_ALERT_EMAIL || 'hr@company.com',
            subject: `[Bulk] Pay anomaly alert — ${result.outlierCount} outliers`,
            body: `${result.outlierCount} employees outside salary bands flagged to HR.`,
            useCase: 'pay_anomaly_alert',
          },
        }).catch(() => {});
      }
      res.json({ data: result });
    } catch (e) { next(e); }
  },

  sendRsuCliffReminders: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await emailService.sendRsuCliffReminders();
      if (result.sent > 0) {
        await prisma.mailLog.create({
          data: {
            sentById: req.user!.userId,
            recipientEmail: `${result.sent} employee(s)`,
            subject: `[Bulk] RSU vesting reminders — ${result.upcoming} upcoming vests`,
            body: `Sent RSU vesting reminders to ${result.sent} employees.`,
            useCase: 'rsu_cliff_reminder',
          },
        }).catch(() => {});
      }
      res.json({ data: result });
    } catch (e) { next(e); }
  },

  aiCompose: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { useCase, employeeName, department, band, rating, ctc } = req.body;
      if (!useCase?.trim()) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'useCase is required' } });
      }

      const contextLine = [
        employeeName && `Employee: ${employeeName}`,
        department && `Department: ${department}`,
        band && `Band: ${band}`,
        rating != null && `Performance Rating: ${rating}/5`,
        ctc != null && `Annual CTC: ₹${(ctc / 100000).toFixed(1)}L`,
      ].filter(Boolean).join(', ');

      const prompt = `You are an experienced HR communication specialist. Write a professional, empathetic HR email.

Use case: ${useCase}
${contextLine ? `Employee context: ${contextLine}` : ''}

Instructions:
- Adjust the tone based on the use case (corrective/firm for underperformance, warm/motivational for recognition, formal for policy matters)
- Keep it concise — 3 to 4 short paragraphs
- Do NOT include a salutation line (Dear ...) or a sign-off (Regards, HR Team) — those will be added separately
- Return ONLY valid JSON with exactly two keys: "subject" (plain text) and "body" (complete HTML suitable for an email body, using inline styles, no <html>/<body> tags)

Example format:
{"subject":"...","body":"<p style=\\"...\\">..</p>"}`;

      const response = await callClaude(prompt, {
        temperature: 0.5,
        maxTokens: 1500,
        system: 'You are an HR communication expert. Always return valid JSON only — no markdown, no explanation.',
      });

      let parsed: { subject: string; body: string };
      try {
        parsed = JSON.parse(response.content.replace(/```json\s*/gi, '').replace(/```/gi, '').trim());
      } catch {
        return res.status(500).json({ error: { code: 'PARSE_ERROR', message: 'AI returned malformed JSON' } });
      }

      res.json({ data: { subject: parsed.subject, body: parsed.body } });
    } catch (e) { next(e); }
  },

  sendCustom: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { recipientEmail, subject, body, useCase } = req.body;
      if (!recipientEmail || !subject || !body) {
        return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'recipientEmail, subject, and body are required' } });
      }

      await emailService.sendCustomEmail(recipientEmail, subject, body);

      await prisma.mailLog.create({
        data: {
          sentById: req.user!.userId,
          recipientEmail,
          subject,
          body,
          useCase: useCase || '',
        },
      });

      res.json({ data: { sent: true } });
    } catch (e) { next(e); }
  },

  getMailLogs: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, parseInt(req.query.limit as string) || 20);
      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        prisma.mailLog.findMany({
          skip,
          take: limit,
          orderBy: { sentAt: 'desc' },
          include: { sentBy: { select: { id: true, name: true, email: true } } },
        }),
        prisma.mailLog.count(),
      ]);

      res.json({ data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
    } catch (e) { next(e); }
  },
};
