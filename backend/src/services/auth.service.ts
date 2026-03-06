import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { unauthorized, badRequest } from '../middleware/errorHandler';
import type { AuthUser } from '../types/index';

const ACCESS_SECRET = process.env.JWT_SECRET || 'compsense-access-secret-min-32-chars';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'compsense-refresh-secret-min-32-chars';
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export const authService = {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw unauthorized('Invalid email or password');

    if (!user.isActive) throw unauthorized('Your account has been deactivated. Contact your admin.');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw unauthorized('Invalid email or password');

    const authUser: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { userId: user.id, role: user.role },
      REFRESH_SECRET,
      { expiresIn: REFRESH_EXPIRES } as jwt.SignOptions
    );

    // Calculate 7-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await Promise.all([
      prisma.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return { accessToken, refreshToken, user: authUser };
  },

  async refresh(refreshToken: string) {
    let payload: { userId: string; role: string };
    try {
      payload = jwt.verify(refreshToken, REFRESH_SECRET) as { userId: string; role: string };
    } catch {
      throw unauthorized('Invalid refresh token');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      throw unauthorized('Refresh token expired or revoked');
    }

    const accessToken = jwt.sign(
      { userId: payload.userId, role: payload.role },
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions
    );

    return { accessToken };
  },

  async logout(refreshToken: string) {
    try {
      await prisma.refreshToken.delete({ where: { token: refreshToken } });
    } catch {
      // Ignore if token doesn't exist
    }
  },

  async getMe(userId: string): Promise<AuthUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized('User not found');
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthorized('User not found');
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw unauthorized('Current password is incorrect');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
    // Revoke all refresh tokens for security
    await prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Password changed. Please log in again.' };
  },

  async createUser(email: string, password: string, name: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw badRequest('Email already registered');

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  },

  async updateName(userId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw badRequest('Name cannot be empty');
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: trimmed },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  },

  async getSessions(userId: string) {
    return prisma.refreshToken.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async revokeAllSessions(userId: string) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'All sessions revoked. Please log in again.' };
  },
};
