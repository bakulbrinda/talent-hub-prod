import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { scenariosController } from '../controllers/scenarios.controller';

const router = Router();
router.use(authenticate);

router.get('/', scenariosController.getAll);
router.post('/', scenariosController.create);
router.post('/analyze-run', scenariosController.analyzeRunResult);
router.get('/:id', scenariosController.getById);
router.put('/:id', scenariosController.update);
router.delete('/:id', scenariosController.delete);
router.post('/:id/run', scenariosController.run);
router.post('/:id/apply', scenariosController.apply);

export default router;
