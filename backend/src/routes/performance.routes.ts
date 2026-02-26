import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { performanceController } from '../controllers/performance.controller';

const router = Router();
router.use(authenticate);

router.get('/ratings', performanceController.getRatings);
router.post('/ratings', performanceController.createRating);
router.get('/matrix', performanceController.getMatrix);
router.get('/promotion-readiness', performanceController.getPromotionReadiness);
router.get('/pay-alignment-gaps', performanceController.getPayAlignmentGaps);
router.get('/cycles', performanceController.getCycles);
router.get('/ai-analysis', performanceController.getAIAnalysis);

export default router;
