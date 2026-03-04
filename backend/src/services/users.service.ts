/**
 * users.service — User management + invite system (Phase 6)
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { UserRole } from '../types/index';

export const usersService = {
  /** List all users (admin view) */
  getAll: async () => {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
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
      select: { id: true, email: true, name: true, role: true },
    });
  },

  /** Delete a user */
  delete: async (userId: string) => {
    return prisma.user.delete({ where: { id: userId } });
  },

  // ─── Invite System ─────────────────────────────────────────────

  /** Create an invite token for a given email + role */
  createInvite: async (email: string, role: UserRole, invitedById: string) => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Upsert: if email was already invited, refresh the token
    return prisma.userInvite.upsert({
      where: { email },
      create: { email, role, token, invitedById, expiresAt },
      update: { role, token, invitedById, expiresAt, usedAt: null },
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
        },
      }),
      prisma.userInvite.update({
        where: { token },
        data: { usedAt: new Date() },
      }),
    ]);

    return user;
  },

  /** List pending (unused) invites */
  getPendingInvites: async () => {
    return prisma.userInvite.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
  },

  /** Revoke (delete) an invite */
  revokeInvite: async (inviteId: string) => {
    return prisma.userInvite.delete({ where: { id: inviteId } });
  },
};
