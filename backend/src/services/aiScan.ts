/**
 * aiScan — Proactive AI Anomaly Detection (Phase 4)
 *
 * Runs on startup (30s delay) and every 1 hour.
 * Claude analyses the live OrgSnapshot, produces up to 5 actionable findings,
 * each persisted as a real Notification row and emitted via Socket.io so every
 * connected client sees the banner in real time.
 *
 * Deduplication: a finding is skipped if a Notification with the exact same
 * title was already created in the last 24 hours.
 *
 * Redis mutex (key: ai_scan:running, TTL 10 min) prevents concurrent runs.
 */

import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';
import { emitNotification } from '../lib/socket';
import { gatherOrgSnapshot } from './orgSnapshot';
import { cacheGet, cacheSet } from '../lib/redis';
import logger from '../lib/logger';
import type { NotificationType, NotificationSeverity } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScanFinding {
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

const SCAN_MUTEX_KEY = 'ai_scan:running';
const SCAN_MUTEX_TTL = 10 * 60; // 10 minutes — prevents hung scans from blocking forever

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are CompSense Sentinel — an autonomous compensation intelligence agent.
You receive a real-time snapshot of an organization's compensation data and must identify the most
urgent, actionable anomalies that HR leaders need to know about RIGHT NOW.

Return ONLY a valid JSON array with 3–5 findings. No prose, no markdown, just raw JSON.

Each finding must follow this exact shape:
{
  "type": "<PAY_ANOMALY | BUDGET_ALERT | NEW_HIRE_PARITY | RSU_VESTING | GENERAL>",
  "title": "<Concise title ≤ 80 chars>",
  "message": "<Actionable description ≤ 300 chars — include specific names/numbers/percentages>",
  "severity": "<INFO | WARNING | CRITICAL>"
}

Severity guide:
- CRITICAL: Immediate action required (significant legal/financial risk, >30% pay gap, >25% outside band)
- WARNING: Should be addressed this week (5-20% pay gaps, RSU cliff events, low utilization)
- INFO: Noteworthy trend or upcoming event

Focus areas (in priority order):
1. Gender pay gaps by department — flag departments where women earn <90% of men
2. Employees significantly outside salary bands (compa-ratio < 70% or > 130%)
3. RSU vesting cliffs in next 30 days — flag any > 500 units
4. Low compa-ratio employees with high performance ratings (underpaid high performers)
5. Benefits utilization anomalies (< 20% adoption for health/insurance benefits)
6. New hire pay parity issues (employees with <90 days tenure paid >20% above/below band midpoint)`;

// ─── Core Scan Logic ─────────────────────────────────────────────────────────

export async function runProactiveScan(): Promise<void> {
  // ─ Mutex: skip if another scan is already running ──────────────────────────
  const isRunning = await cacheGet<boolean>(SCAN_MUTEX_KEY);
  if (isRunning) {
    logger.info('[AI Scan] Skipped — scan already running');
    return;
  }

  await cacheSet(SCAN_MUTEX_KEY, true, SCAN_MUTEX_TTL);

  try {
    logger.info('[AI Scan] Starting proactive scan…');

    // ─ Gather live org data ──────────────────────────────────────────────────
    const snapshot = await gatherOrgSnapshot();
    logger.info(`[AI Scan] Snapshot gathered — ${snapshot.totalEmployees} employees`);

    // ─ Build compact data payload for Claude ────────────────────────────────
    const dataPayload = {
      generatedAt: snapshot.generatedAt,
      totalEmployees: snapshot.totalEmployees,
      avgCompaRatio: snapshot.avgCompaRatio,
      // Top 30 employees sorted by compa-ratio ascending (most at-risk first)
      employees: snapshot.employees
        .sort((a, b) => (a.compaRatio ?? 999) - (b.compaRatio ?? 999))
        .slice(0, 30)
        .map(e => ({
          name: e.name,
          band: e.band,
          dept: e.department,
          gender: e.gender,
          lakhs: e.annualFixedLakhs,
          cr: e.compaRatio,
          days: e.daysSinceJoining,
          perf: e.latestPerfRating,
        })),
      bands: snapshot.bands,
      genderByDept: snapshot.genderByDept,
      rsuCliff: snapshot.rsuCliff,
      benefits: snapshot.benefits,
    };

    // ─ Call Claude ──────────────────────────────────────────────────────────
    const response = await callClaude(
      `Analyze this org compensation snapshot and return 3–5 findings as a JSON array:\n\n${JSON.stringify(dataPayload, null, 2)}`,
      {
        system: SYSTEM_PROMPT,
        temperature: 0.2,
        maxTokens: 1500,
      }
    );

    // ─ Parse findings ────────────────────────────────────────────────────────
    let findings: ScanFinding[];
    try {
      // Claude may wrap in ```json``` — strip it
      const raw = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      findings = JSON.parse(raw);
      if (!Array.isArray(findings)) throw new Error('Not an array');
    } catch (parseErr) {
      logger.error('[AI Scan] Failed to parse Claude response:', parseErr);
      logger.debug('[AI Scan] Raw response:', response.content);
      return;
    }

    logger.info(`[AI Scan] Claude returned ${findings.length} findings`);

    // ─ Persist + emit each finding (with deduplication) ─────────────────────
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let created = 0;
    let skipped = 0;

    for (const finding of findings) {
      // Validate required fields
      if (!finding.type || !finding.title || !finding.message || !finding.severity) {
        logger.warn('[AI Scan] Skipping malformed finding:', finding);
        skipped++;
        continue;
      }

      // Deduplicate: skip if exact title already created in last 24h
      const existing = await prisma.notification.findFirst({
        where: {
          title: finding.title,
          createdAt: { gte: twentyFourHoursAgo },
        },
        select: { id: true },
      });

      if (existing) {
        logger.debug(`[AI Scan] Duplicate skipped: "${finding.title}"`);
        skipped++;
        continue;
      }

      // Validate enum values to avoid Prisma throws
      const validTypes: NotificationType[] = ['PAY_ANOMALY', 'BUDGET_ALERT', 'NEW_HIRE_PARITY', 'RSU_VESTING', 'GENERAL'];
      const validSeverities: NotificationSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];

      const notifType: NotificationType = validTypes.includes(finding.type as NotificationType)
        ? (finding.type as NotificationType)
        : 'GENERAL';

      const notifSeverity: NotificationSeverity = validSeverities.includes(finding.severity as NotificationSeverity)
        ? (finding.severity as NotificationSeverity)
        : 'INFO';

      // Create real DB record
      const notification = await prisma.notification.create({
        data: {
          type: notifType,
          title: finding.title.slice(0, 200),
          message: finding.message.slice(0, 1000),
          severity: notifSeverity,
          ...(finding.relatedEntityType && { relatedEntityType: finding.relatedEntityType }),
          ...(finding.relatedEntityId && { relatedEntityId: finding.relatedEntityId }),
          metadata: { source: 'ai_scan', scanAt: snapshot.generatedAt },
        },
      });

      // Emit via Socket.io for real-time delivery to all connected clients
      emitNotification({
        notification: {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          severity: notification.severity,
          isRead: false,
          createdAt: notification.createdAt.toISOString(),
        },
      });

      created++;
      logger.info(`[AI Scan] Created notification [${notifSeverity}]: "${finding.title}"`);
    }

    logger.info(`[AI Scan] Complete — ${created} created, ${skipped} skipped`);

  } catch (err) {
    logger.error('[AI Scan] Scan failed:', err);
  } finally {
    // Always release the mutex
    await cacheSet(SCAN_MUTEX_KEY, false, 1); // TTL 1s = effectively deleted
  }
}
