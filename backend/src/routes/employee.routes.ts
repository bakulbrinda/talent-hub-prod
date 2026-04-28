import { Router } from 'express';
import { employeeController as ctrl } from '../controllers/employee.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';

const router = Router();
router.use(authenticate);

router.get('/analytics/summary', ctrl.getAnalytics);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('ADMIN', 'HR_MANAGER'), ctrl.create);
router.put('/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.update);
router.delete('/:id', requireRole('ADMIN', 'HR_MANAGER'), ctrl.delete);

export default router;
