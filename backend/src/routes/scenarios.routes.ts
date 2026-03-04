import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { scenariosController } from '../controllers/scenarios.controller';

const router = Router();
router.use(authenticate);

router.get('/', scenariosController.getAll);
router.post('/', scenariosController.create);
router.post('/analyze-run', scenariosController.analyzeRunResult);
router.get('/:id', scenariosController.getById);
router.put('/:id', scenariosController.update);
router.delete('/:id', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.delete);
router.post('/:id/run', requireRole('ADMIN', 'HR_MANAGER'), scenariosController.run);
router.post('/:id/apply', requireRole('ADMIN'), scenariosController.apply);

export default router;
