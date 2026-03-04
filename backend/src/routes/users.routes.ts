/**
 * users.routes — User management + invite system (Phase 6)
 * All routes require authentication. Management routes require ADMIN role.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { usersService } from '../services/users.service';
import { logAction } from '../services/auditLog.service';
import logger from '../lib/logger';
import { UserRole } from '../types/index';

const router = Router();

// ─── User Management (ADMIN only) ─────────────────────────────────────────────

/** GET /api/users — list all org users */
router.get('/', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const users = await usersService.getAll();
  res.json({ data: users });
});

/** PATCH /api/users/:id/role — change a user's role */
router.patch('/:id/role', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    const validRoles: UserRole[] = ['ADMIN', 'HR_MANAGER', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid role' } });
    }
    const user = await usersService.updateRole(req.params.id, role as UserRole);
    await logAction({
      userId: req.user!.userId,
      action: 'USER_ROLE_CHANGED',
      entityType: 'User',
      entityId: req.params.id,
      metadata: { newRole: role },
      ip: req.ip,
    });
    res.json({ data: user });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** DELETE /api/users/:id — remove a user */
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' } });
    }
    await usersService.delete(req.params.id);
    await logAction({
      userId: req.user!.userId,
      action: 'USER_DELETED',
      entityType: 'User',
      entityId: req.params.id,
      ip: req.ip,
    });
    res.json({ data: { deleted: true } });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

// ─── Invite System ─────────────────────────────────────────────────────────────

/** POST /api/users/invite — create an invite */
router.post('/invite', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'email is required' } });
    }

    const validRoles: UserRole[] = ['ADMIN', 'HR_MANAGER', 'VIEWER'];
    const inviteRole: UserRole = validRoles.includes(role) ? role : 'HR_MANAGER';

    const invite = await usersService.createInvite(email, inviteRole, req.user!.userId);

    // Build invite URL — use origin from request headers if available
    const origin = req.headers.origin || `http://localhost:3001`;
    const inviteUrl = `${origin}/invite/${invite.token}`;

    await logAction({
      userId: req.user!.userId,
      action: 'USER_INVITED',
      entityType: 'UserInvite',
      entityId: invite.id,
      metadata: { email, role: inviteRole },
      ip: req.ip,
    });

    logger.info(`[Invite] Created invite for ${email} (role: ${inviteRole})`);

    res.json({
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        inviteUrl, // Show on screen for copy-paste sharing (no email needed for MVP)
      },
    });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

/** GET /api/users/invites — list pending invites */
router.get('/invites', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const invites = await usersService.getPendingInvites();
  res.json({ data: invites });
});

/** DELETE /api/users/invites/:id — revoke an invite */
router.delete('/invites/:id', authenticate, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    await usersService.revokeInvite(req.params.id);
    res.json({ data: { revoked: true } });
  } catch (err: any) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invite not found' } });
  }
});

// ─── Public: accept invite (no auth required) ─────────────────────────────────

/** GET /api/users/invite/:token — validate an invite token */
router.get('/invite/:token', async (req: Request, res: Response) => {
  const invite = await usersService.validateInvite(req.params.token);
  if (!invite) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invalid or expired invite token' } });
  }
  res.json({ data: { email: invite.email, role: invite.role, expiresAt: invite.expiresAt } });
});

/** POST /api/users/accept-invite — set password and create account */
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
    logger.info(`[Invite] New user created: ${user.email} (${user.role})`);
    res.status(201).json({ data: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: { code: 'INTERNAL', message: err.message } });
  }
});

export default router;
