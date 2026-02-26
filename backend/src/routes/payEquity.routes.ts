import { Router } from 'express';
import { payEquityController as ctrl } from '../controllers/payEquity.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/gender-gap', ctrl.getGenderPayGap);
router.get('/compa-ratio-distribution', ctrl.getCompaRatioDistribution);
router.get('/heatmap', ctrl.getHeatmap);
router.get('/score', ctrl.getScore);
router.get('/outliers', ctrl.getOutliers);
router.get('/new-hire-parity', ctrl.getNewHireParity);

export default router;
