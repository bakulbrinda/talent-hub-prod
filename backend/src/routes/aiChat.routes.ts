import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { streamChat, getHistory, clearHistory, getSessions, getSessionMessages, deleteSession } from '../services/aiChat.service';
import { gatherOrgSnapshot } from '../services/orgSnapshot';
import { callClaude } from '../lib/claudeClient';
import logger from '../lib/logger';

const router = Router();
router.use(authenticate);

/**
 * POST /api/ai/chat/stream
 * Body: { message: string }
 * Streams response as Server-Sent Events:
 *   event: text  data: { text: string }
 *   event: tool  data: { toolName: string }
 *   event: done  data: {}
 *   event: error data: { message: string }
 */
router.post('/stream', async (req: Request, res: Response) => {
  const { message } = req.body;
  const userId = req.user!.userId;

  if (!message?.trim()) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'message is required' } });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: string, data: object) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Keep connection alive with periodic comments (prevents proxy timeouts)
  const keepAlive = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, 15000);

  await streamChat(
    userId,
    message,
    (text)     => send('text',  { text }),
    (toolName) => send('tool',  { toolName }),
    ()         => { clearInterval(keepAlive); send('done', {}); res.end(); },
    (err)      => { clearInterval(keepAlive); send('error', { message: err.message }); res.end(); },
  );
});

/** GET /api/ai/chat/history — returns the stored conversation */
router.get('/history', async (req: Request, res: Response) => {
  const history = await getHistory(req.user!.userId);
  res.json({ data: history });
});

/** DELETE /api/ai/chat/history — archives current conversation, starts fresh */
router.delete('/history', async (req: Request, res: Response) => {
  await clearHistory(req.user!.userId);
  res.json({ data: { cleared: true } });
});

/** GET /api/ai/chat/sessions — list all archived sessions for this user */
router.get('/sessions', async (req: Request, res: Response) => {
  const sessions = await getSessions(req.user!.userId);
  res.json({ data: sessions });
});

/** GET /api/ai/chat/sessions/:id — get full message history for a session */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  const messages = await getSessionMessages(req.user!.userId, req.params.id);
  res.json({ data: messages });
});

/** DELETE /api/ai/chat/sessions/:id — permanently delete a session */
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  await deleteSession(req.user!.userId, req.params.id);
  res.json({ data: { deleted: true } });
});

/**
 * POST /api/ai/chat/band-suggestions
 * Claude analyzes compa-ratio distribution per band and recommends adjustments.
 */
router.post('/band-suggestions', async (req: Request, res: Response) => {
  try {
    const snapshot = await gatherOrgSnapshot();

    // Build per-band compa-ratio stats
    const bandStats: Record<string, { crs: number[]; count: number; belowMid: number }> = {};
    for (const e of snapshot.employees) {
      if (!e.compaRatio) continue;
      if (!bandStats[e.band]) bandStats[e.band] = { crs: [], count: 0, belowMid: 0 };
      bandStats[e.band].crs.push(e.compaRatio);
      bandStats[e.band].count++;
      if (e.compaRatio < 95) bandStats[e.band].belowMid++;
    }

    const bandStatsSummary = Object.entries(bandStats).map(([band, s]) => {
      const avg = s.crs.reduce((a, b) => a + b, 0) / s.crs.length;
      const min = Math.min(...s.crs);
      const max = Math.max(...s.crs);
      return `${band}: ${s.count} employees, avg CR ${avg.toFixed(1)}%, range ${min.toFixed(0)}-${max.toFixed(0)}%, ${s.belowMid} below 95%`;
    }).join('\n');

    const bandRanges = snapshot.bands.map((b: any) =>
      `${b.code}: min ₹${b.minLakhs}L mid ₹${b.midLakhs}L max ₹${b.maxLakhs}L`
    ).join('\n');

    const prompt = `You are CompSense AI, an expert in compensation band design.

CURRENT SALARY BANDS:
${bandRanges}

COMPA-RATIO DISTRIBUTION BY BAND:
${bandStatsSummary}

Analyze whether the current salary band midpoints are well-calibrated to actual employee pay, and provide adjustment recommendations.

Return ONLY a valid JSON array with no prose, no markdown fences, no explanation outside the array.
Each object must have exactly these fields:
- "band": string — the band code (e.g. "P3")
- "currentMidLakhs": number — current mid salary in lakhs
- "suggestedMidLakhs": number — your recommended mid in lakhs
- "suggestedMinLakhs": number — your recommended min in lakhs
- "suggestedMaxLakhs": number — your recommended max in lakhs
- "direction": string — must be exactly one of: "increase", "decrease", "maintain"
- "reasoning": string — 2-sentence explanation
- "impactEmployees": number — count of employees affected
- "urgency": string — must be exactly one of: "high", "medium", "low"

Example of correct output format (use real values, not these):
[
  {
    "band": "P3",
    "currentMidLakhs": 18.5,
    "suggestedMidLakhs": 20.0,
    "suggestedMinLakhs": 15.0,
    "suggestedMaxLakhs": 25.0,
    "direction": "increase",
    "reasoning": "The average compa-ratio of 112% indicates employees are paid above mid. Raising the midpoint will better reflect actual market positioning.",
    "impactEmployees": 32,
    "urgency": "medium"
  }
]

Only suggest changes where the data clearly warrants it. If a band is well-calibrated, use direction "maintain".`;

    const response = await callClaude(prompt, { temperature: 0.2, maxTokens: 4096 });

    let suggestions: any[];
    try {
      // Strip markdown fences if present
      let raw = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      // Extract the JSON array robustly — handles any prose Claude may add before/after
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) raw = match[0];
      suggestions = JSON.parse(raw);
      if (!Array.isArray(suggestions)) throw new Error('Not an array');
    } catch (parseErr: any) {
      logger.error(`[AI Band Suggestions] Parse error: ${parseErr.message}`);
      logger.error(`[AI Band Suggestions] Raw response: ${response.content?.slice(0, 500)}`);
      return res.status(500).json({ error: { code: 'PARSE_ERROR', message: 'AI response could not be parsed' } });
    }

    res.json({ data: suggestions });

  } catch (err: any) {
    logger.error('[AI Band Suggestions] Error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
