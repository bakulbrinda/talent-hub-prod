import { Router } from 'express';
import { notificationsController as ctrl } from '../controllers/notifications.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/summary', ctrl.getSummary);
router.get('/', ctrl.getAll);
router.patch('/mark-all-read', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);
router.delete('/:id', ctrl.deleteOne);

export default router;
