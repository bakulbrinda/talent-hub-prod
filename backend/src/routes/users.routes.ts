/**
 * users.routes — User management + invite system
 * No RBAC: all authenticated users have full access.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { usersService } from '../services/users.service';
import { logAction } from '../services/auditLog.service';
import logger from '../lib/logger';

const router = Router();

// ─── User Management ─────────────────────────────────────────────────────────

/** GET /api/users — list all org users */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const users = await usersService.getAll();
  res.json({ data: users });
});

/** PATCH /api/users/:id/deactivate — soft-deactivate a user */
router.patch('/:id/deactivate', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot deactivate your own account' } });
    }
    const user = await usersService.deactivate(req.params.id);
    await logAction({ userId: req.user!.userId, action: 'USER_DEACTIVATED', entityType: 'User', entityId: req.params.id, ip: req.ip });
    res.json({ data: user });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** PATCH /api/users/:id/reactivate — reactivate a user */
router.patch('/:id/reactivate', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await usersService.reactivate(req.params.id);
    await logAction({ userId: req.user!.userId, action: 'USER_REACTIVATED', entityType: 'User', entityId: req.params.id, ip: req.ip });
    res.json({ data: user });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** POST /api/users/:id/reset-password — generate a password-reset link for a user */
router.post('/:id/reset-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { token, email } = await usersService.generateResetToken(req.params.id);
    const origin = req.headers.origin || 'http://localhost:3001';
    const resetUrl = `${origin}/invite/${token}`;
    await logAction({ userId: req.user!.userId, action: 'USER_RESET_PASSWORD', entityType: 'User', entityId: req.params.id, ip: req.ip });
    logger.info(`[Reset] Generated reset link for ${email}`);
    res.json({ data: { resetUrl } });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** DELETE /api/users/:id — remove a user */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' } });
    }
    await usersService.delete(req.params.id);
    await logAction({ userId: req.user!.userId, action: 'USER_DELETED', entityType: 'User', entityId: req.params.id, ip: req.ip });
    res.json({ data: { deleted: true } });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// ─── Invite System ─────────────────────────────────────────────────────────────

/** POST /api/users/invite — create an invite (name + email only, no role) */
router.post('/invite', authenticate, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email is required' } });
    }

    const invite = await usersService.createInvite(email, 'ADMIN', req.user!.userId);
    const origin = req.headers.origin || 'http://localhost:3001';
    const inviteUrl = `${origin}/invite/${invite.token}`;

    await logAction({ userId: req.user!.userId, action: 'USER_INVITED', entityType: 'UserInvite', entityId: invite.id, metadata: { email }, ip: req.ip });
    logger.info(`[Invite] Created invite for ${email}`);

    res.json({
      data: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt, inviteUrl },
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** GET /api/users/invites — list pending invites */
router.get('/invites', authenticate, async (req: Request, res: Response) => {
  const invites = await usersService.getPendingInvites();
  res.json({ data: invites });
});

/** DELETE /api/users/invites/:id — revoke an invite */
router.delete('/invites/:id', authenticate, async (req: Request, res: Response) => {
  try {
    await usersService.revokeInvite(req.params.id);
    res.json({ data: { revoked: true } });
  } catch (err: any) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found' } });
  }
});

// ─── Public: accept invite (no auth required) ─────────────────────────────────

/** GET /api/users/invite/:token — validate an invite token (returns userExists for reset flow) */
router.get('/invite/:token', async (req: Request, res: Response) => {
  const invite = await usersService.validateInvite(req.params.token);
  if (!invite) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invalid or expired invite token' } });
  }
  const { prisma } = await import('../lib/prisma');
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  res.json({ data: { email: invite.email, expiresAt: invite.expiresAt, userExists: !!existing } });
});

/** POST /api/users/accept-invite — set password and create account (new users only) */
router.post('/accept-invite', async (req: Request, res: Response) => {
  try {
    const { token, name, password } = req.body;
    if (!token || !name || !password) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'token, name, and password are required' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Password must be at least 8 characters' } });
    }
    const user = await usersService.acceptInvite(token, name, password);
    logger.info(`[Invite] New user created: ${user.email}`);
    res.status(201).json({ data: { id: user.id, email: user.email, name: user.name } });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** POST /api/users/apply-reset — apply a password reset token (existing users) */
router.post('/apply-reset', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'token and password are required' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Password must be at least 8 characters' } });
    }
    const result = await usersService.acceptReset(token, password);
    res.json({ data: result });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
