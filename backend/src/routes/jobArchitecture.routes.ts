import { Router } from 'express';
import { jobArchitectureController as ctrl } from '../controllers/jobArchitecture.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

// Mounted at /api/ — full paths relative to /api
router.get('/job-architecture/hierarchy', ctrl.getHierarchy);

router.get('/job-areas', ctrl.getJobAreas);
router.post('/job-areas', ctrl.createJobArea);
router.put('/job-areas/:id', ctrl.updateJobArea);

router.get('/job-families', ctrl.getJobFamilies);
router.post('/job-families', ctrl.createJobFamily);

router.get('/bands', ctrl.getBands);
router.post('/bands', ctrl.createBand);

router.get('/grades', ctrl.getGrades);

router.get('/job-codes', ctrl.getJobCodes);
router.post('/job-codes', ctrl.createJobCode);

router.get('/skills', ctrl.getSkills);
router.post('/skills', ctrl.createSkill);
router.put('/skills/:id', ctrl.updateSkill);

export default router;
