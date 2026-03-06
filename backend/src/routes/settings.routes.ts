/**
 * settings.routes — OrgConfig CRUD + cache management
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { prisma } from '../lib/prisma';
import { cacheDelPattern } from '../lib/redis';

const router = Router();
router.use(authenticate);

const SINGLETON_ID = 'singleton';

/** GET /api/settings/org — get org config (creates with defaults if missing) */
router.get('/org', async (_req: Request, res: Response) => {
  try {
    const config = await prisma.orgConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID },
      update: {},
    });
    res.json({ data: config });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** PATCH /api/settings/org — update org config */
router.patch('/org', async (req: Request, res: Response) => {
  try {
    const {
      orgName,
      fiscalYearStartMonth,
      currencySymbol,
      hrAlertEmails,
      aiScanEnabled,
      aiScanFrequencyMins,
      anomalyCompaThreshold,
      rsuReminderDays,
    } = req.body;

    const data: Record<string, unknown> = {};
    if (orgName !== undefined) data.orgName = orgName;
    if (fiscalYearStartMonth !== undefined) data.fiscalYearStartMonth = Number(fiscalYearStartMonth);
    if (currencySymbol !== undefined) data.currencySymbol = currencySymbol;
    if (hrAlertEmails !== undefined) data.hrAlertEmails = hrAlertEmails;
    if (aiScanEnabled !== undefined) data.aiScanEnabled = Boolean(aiScanEnabled);
    if (aiScanFrequencyMins !== undefined) data.aiScanFrequencyMins = Number(aiScanFrequencyMins);
    if (anomalyCompaThreshold !== undefined) data.anomalyCompaThreshold = Number(anomalyCompaThreshold);
    if (rsuReminderDays !== undefined) data.rsuReminderDays = Number(rsuReminderDays);

    const config = await prisma.orgConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
    res.json({ data: config });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** POST /api/settings/cache/clear — bust AI + dashboard Redis caches */
router.post('/cache/clear', async (_req: Request, res: Response) => {
  try {
    await Promise.allSettled([
      cacheDelPattern('ai:*'),
      cacheDelPattern('dashboard:*'),
      cacheDelPattern('ai_insights:*'),
    ]);
    res.json({ data: { cleared: true } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
