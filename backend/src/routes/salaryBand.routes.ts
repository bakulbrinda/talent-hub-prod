import { Router } from 'express';
import { salaryBandController as ctrl } from '../controllers/salaryBand.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/market-benchmarks', ctrl.getMarketBenchmarks);
router.get('/analysis/outliers', ctrl.getOutliers);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

export default router;
