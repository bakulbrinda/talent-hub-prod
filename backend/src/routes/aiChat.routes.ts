import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { streamChat, getHistory, clearHistory } from '../services/aiChat.service';

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

export default router;
