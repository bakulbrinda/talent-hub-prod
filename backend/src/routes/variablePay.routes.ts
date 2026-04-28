import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { variablePayController } from '../controllers/variablePay.controller';

const router = Router();
router.use(authenticate);

router.get('/plans', variablePayController.getPlans);
router.post('/plans', requireRole('ADMIN', 'HR_MANAGER'), variablePayController.createPlan);
router.put('/plans/:id', requireRole('ADMIN', 'HR_MANAGER'), variablePayController.updatePlan);
router.get('/achievements', variablePayController.getAchievements);
router.post('/achievements', requireRole('ADMIN', 'HR_MANAGER'), variablePayController.saveAchievement);
router.get('/analytics', variablePayController.getAnalytics);
router.post('/calculate', requireRole('ADMIN', 'HR_MANAGER'), variablePayController.calculatePayout);
router.get('/ai-analysis', variablePayController.getAIAnalysis);

export default router;
