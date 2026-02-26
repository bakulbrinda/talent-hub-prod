import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import authRoutes from './routes/auth.routes';
import jobArchitectureRoutes from './routes/jobArchitecture.routes';
import employeeRoutes from './routes/employee.routes';
import salaryBandRoutes from './routes/salaryBand.routes';
import dashboardRoutes from './routes/dashboard.routes';
import notificationsRoutes from './routes/notifications.routes';
import payEquityRoutes from './routes/payEquity.routes';
import aiInsightsRoutes from './routes/aiInsights.routes';
import benefitsRoutes from './routes/benefits.routes';
import rsuRoutes from './routes/rsu.routes';
import performanceRoutes from './routes/performance.routes';
import variablePayRoutes from './routes/variablePay.routes';
import scenarioRoutes from './routes/scenarios.routes';
import exportRoutes from './routes/export.routes';
import importRoutes from './routes/import.routes';

const app = express();

// ─── Security & Performance ───────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // mobile / curl / Postman
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' } },
});
app.use('/api', limiter);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ──────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Talent Hub API',
    version: '2.0.0',
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Job Architecture routes: /api/hierarchy, /api/job-areas, /api/bands, etc.
app.use('/api', jobArchitectureRoutes);

app.use('/api/employees', employeeRoutes);

// Salary Bands
app.use('/api/salary-bands', salaryBandRoutes);

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/pay-equity', payEquityRoutes);
app.use('/api/ai-insights', aiInsightsRoutes);
app.use('/api/benefits', benefitsRoutes);
app.use('/api/rsu', rsuRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/variable-pay', variablePayRoutes);
app.use('/api/scenarios', scenarioRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);

// ─── 404 Fallback ─────────────────────────────────────────────
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

export default app;
