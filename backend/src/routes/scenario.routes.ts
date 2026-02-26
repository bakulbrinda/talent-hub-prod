import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { scenarioController } from '../controllers/scenario.controller';

const router = Router();
router.use(authenticate);

router.get('/', scenarioController.getAll);
router.post('/', scenarioController.create);
router.post('/compare', scenarioController.compare);
router.post('/analyze-run', scenarioController.analyzeRunResult);
router.get('/:id', scenarioController.getById);
router.post('/:id/run', scenarioController.run);
router.post('/:id/apply', scenarioController.apply);
router.delete('/:id', scenarioController.delete);

export default router;
