import { Router } from 'express';
import { notificationsController as ctrl } from '../controllers/notifications.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { runProactiveScan } from '../services/aiScan';
import logger from '../lib/logger';

const router = Router();
router.use(authenticate);

router.get('/summary', ctrl.getSummary);
router.get('/', ctrl.getAll);
router.patch('/mark-all-read', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);
router.delete('/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteOne);

// Admin-only: manually trigger the proactive AI scan immediately.
// Useful for demos and testing without waiting for the 1-hour interval.
router.post('/trigger-scan', requireRole('ADMIN'), async (req, res) => {
  logger.info(`[AI Scan] Manual trigger by user ${(req as any).user?.userId}`);
  // Fire-and-forget — respond immediately so the UI isn't blocked
  runProactiveScan().catch(err => logger.error('[AI Scan] Manual scan error:', err));
  res.json({ data: { message: 'AI scan started — check notifications in ~30 seconds' } });
});

export default router;
