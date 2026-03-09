import { Router } from 'express';
import { jobArchitectureController as ctrl } from '../controllers/jobArchitecture.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

const router = Router();
router.use(authenticate);

// Mounted at /api/ — full paths relative to /api
router.get('/job-architecture/hierarchy', ctrl.getHierarchy);

router.get('/job-areas', ctrl.getJobAreas);
router.post('/job-areas', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createJobArea);
router.put('/job-areas/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateJobArea);

router.get('/job-families', ctrl.getJobFamilies);
router.post('/job-families', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createJobFamily);

router.get('/bands', ctrl.getBands);
router.post('/bands', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createBand);
router.put('/bands/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateBand);
router.delete('/bands/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.deleteBand);

router.get('/grades', ctrl.getGrades);

router.get('/job-codes', ctrl.getJobCodes);
router.post('/job-codes', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createJobCode);

router.get('/skills', ctrl.getSkills);
router.post('/skills', requireRole('ADMIN', 'HR_MANAGER'), ctrl.createSkill);
router.put('/skills/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.updateSkill);

export default router;
