/**
 * users.service — User management + invite system (Phase 6)
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { UserRole, HR_STAFF_DEFAULT_PERMISSIONS } from '../types/index';

export const usersService = {
  /** List all users (admin view) */
  getAll: async () => {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  /** Change a user's role */
  updateRole: async (userId: string, role: UserRole) => {
    return prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true, permissions: true },
    });
  },

  /** Update a user's feature permissions */
  updatePermissions: async (userId: string, permissions: string[]) => {
    return prisma.user.update({
      where: { id: userId },
      data: { permissions },
      select: { id: true, email: true, name: true, role: true, permissions: true },
    });
  },

  /** Soft-deactivate a user — prevents login and revokes all sessions */
  deactivate: async (userId: string) => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    return prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
      select: { id: true, email: true, name: true, isActive: true },
    });
  },

  /** Reactivate a previously deactivated user */
  reactivate: async (userId: string) => {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
      select: { id: true, email: true, name: true, isActive: true },
    });
  },

  /** Permanently delete a user — revokes all sessions and removes the record */
  delete: async (userId: string) => {
    // Revoke all active sessions first so the user is immediately logged out
    await prisma.refreshToken.deleteMany({ where: { userId } });
    // Clean up any pending invite/reset tokens tied to this user's email
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) {
      await prisma.userInvite.deleteMany({ where: { email: user.email } });
    }
    return prisma.user.delete({ where: { id: userId } });
  },

  // ─── Invite System ─────────────────────────────────────────────

  /** Create a user directly with admin-set credentials */
  createDirect: async (name: string, email: string, password: string) => {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const err = new Error('An account with this email already exists') as any;
      err.statusCode = 409;
      throw err;
    }
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name: name.trim(), email: email.trim().toLowerCase(), password: hashed },
      select: { id: true, email: true, name: true, isActive: true },
    });
    // Mark any pending invite for this email as used
    await prisma.userInvite.updateMany({
      where: { email: user.email, usedAt: null },
      data: { usedAt: new Date() },
    });
    return user;
  },

  /** Generate a password-reset link for an existing user */
  generateResetToken: async (userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      const err = new Error('User not found') as any;
      err.statusCode = 404;
      throw err;
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.userInvite.upsert({
      where: { email: user.email },
      create: { email: user.email, role: user.role, token, invitedById: userId, expiresAt },
      update: { token, invitedById: userId, expiresAt, usedAt: null },
    });
    return { token, email: user.email };
  },

  /** Apply a reset token — updates the existing user's password */
  acceptReset: async (token: string, password: string) => {
    const invite = await prisma.userInvite.findUnique({ where: { token } });
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      const err = new Error('Invalid or expired reset token') as any;
      err.statusCode = 400;
      throw err;
    }
    const user = await prisma.user.findUnique({ where: { email: invite.email } });
    if (!user) {
      const err = new Error('User not found') as any;
      err.statusCode = 404;
      throw err;
    }
    const hashed = await bcrypt.hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.userInvite.update({ where: { token }, data: { usedAt: new Date() } }),
    ]);
    return { message: 'Password reset successfully. Please log in with your new password.' };
  },

  /** Create an invite token for a given email */
  createInvite: async (email: string, role: UserRole, invitedById: string, permissions?: string[]) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Use provided permissions; for HR_STAFF default to role defaults if none given
    const resolvedPermissions =
      permissions ?? (role === 'HR_STAFF' ? HR_STAFF_DEFAULT_PERMISSIONS : []);

    // Upsert: if email was already invited, refresh the token and permissions
    return prisma.userInvite.upsert({
      where: { email },
      create: { email, role, token, invitedById, expiresAt, permissions: resolvedPermissions },
      update: { role, token, invitedById, expiresAt, usedAt: null, permissions: resolvedPermissions },
    });
  },

  /** Validate an invite token — returns the invite if valid */
  validateInvite: async (token: string) => {
    const invite = await prisma.userInvite.findUnique({ where: { token } });
    if (!invite) return null;
    if (invite.usedAt) return null; // already used
    if (invite.expiresAt < new Date()) return null; // expired
    return invite;
  },

  /** Accept an invite — create the User account, mark invite as used */
  acceptInvite: async (token: string, name: string, password: string) => {
    const invite = await usersService.validateInvite(token);
    if (!invite) {
      const err = new Error('Invalid or expired invite token') as any;
      err.statusCode = 400;
      throw err;
    }

    // Check if user already exists with this email
    const existing = await prisma.user.findUnique({ where: { email: invite.email } });
    if (existing) {
      const err = new Error('An account with this email already exists') as any;
      err.statusCode = 409;
      throw err;
    }

    const hashed = await bcrypt.hash(password, 12);

    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: {
          email: invite.email,
          name,
          password: hashed,
          role: invite.role,
          permissions: invite.permissions,
        },
      }),
      prisma.userInvite.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ]);

    return user;
  },

  /** List pending (unused) invites — excludes invites for users that already have accounts */
  getPendingInvites: async () => {
    const invites = await prisma.userInvite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
    });
    if (invites.length === 0) return invites;
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: invites.map(i => i.email) } },
      select: { email: true },
    });
    const existingEmails = new Set(existingUsers.map(u => u.email));
    return invites.filter(i => !existingEmails.has(i.email));
  },

  /** Revoke (delete) an invite */
  revokeInvite: async (inviteId: string) => {
    return prisma.userInvite.delete({ where: { id: inviteId } });
  },
};
