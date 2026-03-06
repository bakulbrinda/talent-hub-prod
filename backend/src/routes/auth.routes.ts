import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, authController.updateMe);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/sessions', authenticate, authController.getSessions);
router.delete('/sessions', authenticate, authController.revokeAllSessions);

export default router;
