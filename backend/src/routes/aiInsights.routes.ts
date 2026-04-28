import { Router } from 'express';
import { aiInsightsController as ctrl } from '../controllers/aiInsights.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/dashboard-summary', ctrl.getDashboardSummary);

export default router;
