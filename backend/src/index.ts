import 'dotenv/config';
import http from 'http';
import app from './app';
import { initializeSocket } from './lib/socket';
import { redisClient } from './lib/redis';
import { prisma } from './lib/prisma';
import logger from './lib/logger';

const PORT = parseInt(process.env.PORT || '3001', 10);

async function bootstrap() {
  try {
    // ─── Test DB Connection ──────────────────────────────────
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected');

    // ─── Test Redis Connection ───────────────────────────────
    await redisClient.ping();
    logger.info('✅ Redis connected');

    // ─── Create HTTP Server ──────────────────────────────────
    const server = http.createServer(app);

    // ─── Initialize Socket.io ────────────────────────────────
    initializeSocket(server);
    logger.info('✅ Socket.io initialized');

    // ─── Start Server ────────────────────────────────────────
    server.listen(PORT, () => {
      logger.info(`🚀 CompSense API running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
    });

    // ─── Graceful Shutdown ───────────────────────────────────
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await prisma.$disconnect();
        await redisClient.quit();
        logger.info('Server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
