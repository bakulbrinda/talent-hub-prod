import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { variablePayController } from '../controllers/variablePay.controller';

const router = Router();
router.use(authenticate);

router.get('/plans', variablePayController.getPlans);
router.post('/plans', variablePayController.createPlan);
router.put('/plans/:id', variablePayController.updatePlan);
router.get('/achievements', variablePayController.getAchievements);
router.post('/achievements', variablePayController.saveAchievement);
router.post('/simulate', variablePayController.calculatePayout);
router.get('/analytics', variablePayController.getAnalytics);
router.post('/calculate', variablePayController.calculatePayout);
router.get('/ai-analysis', variablePayController.getAIAnalysis);

export default router;
