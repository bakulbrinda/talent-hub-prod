import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { streamChat, getHistory, clearHistory } from '../services/aiChat.service';
import { callClaude } from '../lib/claudeClient';
import { gatherOrgSnapshot } from '../services/orgSnapshot';
import { prisma } from '../lib/prisma';
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

/** DELETE /api/ai/chat/history — wipes conversation for this user */
router.delete('/history', async (req: Request, res: Response) => {
  await clearHistory(req.user!.userId);
  res.json({ data: { cleared: true } });
});

/**
 * POST /api/ai/chat/suggest-scenarios
 * Body: { goal: string }
 * Claude analyzes the org snapshot against the user's goal and creates
 * 3 DRAFT Scenario records in the DB, then returns them.
 */
router.post('/suggest-scenarios', async (req: Request, res: Response) => {
  try {
    const { goal } = req.body;
    if (!goal?.trim()) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'goal is required' } });
    }

    const userId = req.user!.userId;
    logger.info(`[AI Suggest] User ${userId} requesting scenarios for: "${goal.slice(0, 80)}"`);

    const snapshot = await gatherOrgSnapshot();

    const totalPayrollLakhs = snapshot.employees.reduce((s, e) => s + e.annualFixedLakhs, 0);
    const bands = snapshot.bands.map(b => `${b.code}: min ₹${b.minLakhs}L mid ₹${b.midLakhs}L max ₹${b.maxLakhs}L`).join(', ');
    const deptCounts = snapshot.employees.reduce<Record<string, number>>((acc, e) => {
      acc[e.department] = (acc[e.department] || 0) + 1;
      return acc;
    }, {});

    const prompt = `You are CompSense AI, an expert compensation strategist.

ORG CONTEXT:
- ${snapshot.totalEmployees} active employees
- Total annual payroll: ₹${totalPayrollLakhs.toFixed(0)}L
- Avg compa-ratio: ${snapshot.avgCompaRatio}%
- Salary bands: ${bands}
- Departments: ${Object.entries(deptCounts).map(([d, c]) => `${d} (${c})`).join(', ')}

HR MANAGER'S GOAL: "${goal}"

Generate exactly 3 distinct compensation scenarios that address this goal. The scenarios should vary in approach (e.g., targeted vs broad, aggressive vs conservative).

Return ONLY a valid JSON array (no prose, no markdown):
[
  {
    "name": "Scenario name (max 60 chars)",
    "description": "1-2 sentence description of what this scenario does",
    "rationale": "Why this approach addresses the goal (2 sentences)",
    "estimatedCostLakhs": <number — estimated additional annual cost in lakhs>,
    "costPercent": <number — % of current total payroll>,
    "affectedCount": <number — estimated employees affected>,
    "rules": [
      {
        "filter": {
          "band": ["P3"] or [] for all,
          "department": ["Engineering"] or [] for all,
          "performanceRating": { "min": 4 } or omit,
          "compaRatio": { "max": 90 } or omit
        },
        "action": {
          "type": "RAISE_PERCENT" | "RAISE_FLAT" | "SET_TO_BENCHMARK" | "SET_COMPA_RATIO",
          "value": <number>
        }
      }
    ]
  }
]

Rules:
- RAISE_PERCENT value = percentage increase (e.g. 10 for 10%)
- RAISE_FLAT value = flat rupee amount
- SET_COMPA_RATIO value = target compa-ratio percentage (e.g. 100 for 100%)
- SET_TO_BENCHMARK has no value needed (use 0)
- Use only bands that exist: A1, A2, P1, P2, P3, P4 (NOT M1, M2, D0, D1, D2)
- Estimated costs should be realistic and not exceed 15% of total payroll`;

    const response = await callClaude(prompt, { temperature: 0.4, maxTokens: 2000 });

    let suggestions: any[];
    try {
      const raw = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      suggestions = JSON.parse(raw);
      if (!Array.isArray(suggestions)) throw new Error('Not an array');
    } catch {
      logger.error('[AI Suggest] Failed to parse Claude response');
      return res.status(500).json({ error: { code: 'PARSE_ERROR', message: 'AI response could not be parsed' } });
    }

    // Create 3 DRAFT scenarios in DB
    const created = await Promise.all(
      suggestions.slice(0, 3).map(s =>
        prisma.scenario.create({
          data: {
            name: String(s.name).slice(0, 200),
            description: `${String(s.description || '')}\n\n**AI Rationale**: ${String(s.rationale || '')}`.slice(0, 1000),
            rules: s.rules as any,
            createdById: userId,
            status: 'DRAFT',
          },
        })
      )
    );

    const result = created.map((scenario, i) => ({
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      estimatedCostLakhs: suggestions[i]?.estimatedCostLakhs ?? 0,
      costPercent: suggestions[i]?.costPercent ?? 0,
      affectedCount: suggestions[i]?.affectedCount ?? 0,
      rationale: suggestions[i]?.rationale ?? '',
      rules: scenario.rules,
      status: scenario.status,
    }));

    logger.info(`[AI Suggest] Created ${created.length} DRAFT scenarios`);
    res.json({ data: result });

  } catch (err: any) {
    logger.error('[AI Suggest] Error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
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

    const bandRanges = snapshot.bands.map(b =>
      `${b.code}: min ₹${b.minLakhs}L mid ₹${b.midLakhs}L max ₹${b.maxLakhs}L`
    ).join('\n');

    const prompt = `You are CompSense AI, an expert in compensation band design.

CURRENT SALARY BANDS:
${bandRanges}

COMPA-RATIO DISTRIBUTION BY BAND:
${bandStatsSummary}

Analyze whether the current salary band midpoints are well-calibrated to actual employee pay, and provide adjustment recommendations.

Return ONLY a valid JSON array (no prose, no markdown):
[
  {
    "band": "P3",
    "currentMidLakhs": 18.5,
    "suggestedMidLakhs": 20.0,
    "suggestedMinLakhs": 15.0,
    "suggestedMaxLakhs": 25.0,
    "direction": "increase" | "decrease" | "maintain",
    "reasoning": "2-sentence explanation of why this adjustment is recommended",
    "impactEmployees": <number of employees affected>,
    "urgency": "high" | "medium" | "low"
  }
]

Only suggest changes where the data clearly warrants it. If a band is well-calibrated, use direction "maintain" with reasoning.`;

    const response = await callClaude(prompt, { temperature: 0.2, maxTokens: 1200 });

    let suggestions: any[];
    try {
      const raw = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      suggestions = JSON.parse(raw);
      if (!Array.isArray(suggestions)) throw new Error('Not an array');
    } catch {
      return res.status(500).json({ error: { code: 'PARSE_ERROR', message: 'AI response could not be parsed' } });
    }

    res.json({ data: suggestions });

  } catch (err: any) {
    logger.error('[AI Band Suggestions] Error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
