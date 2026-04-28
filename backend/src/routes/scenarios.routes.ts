import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { requireAccess } from '../middleware/requireAccess';
import { scenariosController } from '../controllers/scenarios.controller';

const router = Router();
router.use(authenticate);

router.get('/', scenariosController.getAll);
router.post('/', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.create);
router.post('/analyze-run', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.analyzeRunResult);
router.get('/:id', scenariosController.getById);
router.put('/:id', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.update);
router.delete('/:id', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.delete);
router.post('/:id/run', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.run);
router.post('/:id/apply', requireAccess('scenario.apply'), scenariosController.apply);

export default router;
