import { Router } from 'express';
import { employeeController as ctrl } from '../controllers/employee.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/analytics/summary', ctrl.getAnalytics);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

export default router;
