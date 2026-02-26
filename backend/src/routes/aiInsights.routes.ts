import { Router } from 'express';
import { aiInsightsController as ctrl } from '../controllers/aiInsights.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/dashboard-summary', ctrl.getDashboardSummary);
router.get('/', ctrl.getAll);
router.get('/:type', ctrl.getOrGenerate);
router.post('/generate', ctrl.generate);
router.delete('/:id/invalidate', ctrl.invalidate);

export default router;
