import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { benefitsController, benefitsUpload } from '../controllers/benefits.controller';

const router = Router();
router.use(authenticate);

router.get('/catalog', benefitsController.getCatalog);
router.get('/utilization', benefitsController.getUtilization);
router.get('/enrollments', benefitsController.getEnrollments);
router.get('/category-summary', benefitsController.getCategorySummary);
router.post('/enroll', benefitsController.enroll);
router.get('/eligibility/:employeeId/:benefitId', benefitsController.checkEligibility);
router.get('/ai-analysis', benefitsController.getAIAnalysis);
router.post('/import', benefitsUpload.single('file'), benefitsController.importData);

export default router;
