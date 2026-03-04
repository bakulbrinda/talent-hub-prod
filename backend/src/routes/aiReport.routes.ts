import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { streamLeadershipReport } from '../services/aiReport';
import logger from '../lib/logger';

const router = Router();
router.use(authenticate);

/**
 * POST /api/ai/report/stream
 * Streams a 5-section leadership compensation briefing as Server-Sent Events.
 *
 * SSE events:
 *   event: progress      data: { message: string, step: number, total: number }
 *   event: section_start data: { index: number, title: string }
 *   event: text          data: { delta: string }
 *   event: section_end   data: { index: number }
 *   event: done          data: {}
 *   event: error         data: { message: string }
 */
router.post('/stream', async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  logger.info(`[AI Report] Report requested by user ${userId}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Keep-alive comment every 20 seconds to prevent proxy timeouts
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 20_000);

  try {
    await streamLeadershipReport(res);
  } finally {
    clearInterval(keepAlive);
    if (!res.writableEnded) res.end();
  }
});

export default router;
