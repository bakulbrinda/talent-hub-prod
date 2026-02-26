import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { rsuController } from '../controllers/rsu.controller';

const router = Router();
router.use(authenticate);

router.get('/', rsuController.getGrants);
router.post('/', rsuController.createGrant);
router.get('/vesting-schedule', rsuController.getVestingSchedule);
router.get('/eligibility-gap', rsuController.getEligibilityGap);
router.get('/summary', rsuController.getSummary);
router.get('/ai-analysis', rsuController.getAIAnalysis);

export default router;
