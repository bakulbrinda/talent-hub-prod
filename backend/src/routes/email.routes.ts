import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { emailController } from '../controllers/email.controller';

const router = Router();
router.use(authenticate);

// POST /api/email/low-performer-alert   — sends alerts to managers with low performers
// Body: { ratingThreshold?: number }   — default 3.0
router.post('/low-performer-alert', emailController.sendLowPerformerAlerts);

// POST /api/email/pay-anomaly-alert     — sends pay anomaly summary to HR_ALERT_EMAIL
router.post('/pay-anomaly-alert', emailController.sendPayAnomalyAlert);

// POST /api/email/rsu-reminders         — sends RSU cliff reminders (vesting in 30 days)
router.post('/rsu-reminders', emailController.sendRsuCliffReminders);

// POST /api/email/ai-compose            — Claude generates subject + HTML body from use case
router.post('/ai-compose', emailController.aiCompose);

// POST /api/email/send-custom           — send a composed email and log it
router.post('/send-custom', emailController.sendCustom);

// GET  /api/email/mail-logs             — list all sent mail logs
router.get('/mail-logs', emailController.getMailLogs);

export default router;
