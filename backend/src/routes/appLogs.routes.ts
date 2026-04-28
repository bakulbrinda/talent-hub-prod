import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { appLogsController } from '../controllers/appLogs.controller';

const router = Router();

// All app-logs endpoints are ADMIN only
router.use(authenticate, requireRole('ADMIN'));

router.get('/', appLogsController.getLogs);
router.get('/stats', appLogsController.getStats);
router.get('/users', appLogsController.getUsers);

export default router;
