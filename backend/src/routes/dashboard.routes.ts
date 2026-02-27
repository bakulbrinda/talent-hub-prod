import { Router } from 'express';
import { dashboardController as ctrl } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
router.use(authenticate);

router.get('/kpis', ctrl.getKpis);
router.get('/band-distribution', ctrl.getBandDistribution);
router.get('/salary-distribution', ctrl.getSalaryDistribution);
router.get('/compensation-trend', ctrl.getCompensationTrend);
router.get('/pay-equity-summary', ctrl.getPayEquitySummary);
router.get('/ai-summary', ctrl.getAiSummary);
router.get('/comp-vs-performance', ctrl.getCompVsPerformancePlot);
router.get('/dept-pay-equity-heatmap', ctrl.getDeptPayEquityHeatmap);
router.get('/rsu-vesting-timeline', ctrl.getRsuVestingTimeline);
router.get('/attrition-risk', ctrl.getAttritionRiskDistribution);
router.get('/action-required', ctrl.getActionRequired);

export default router;
