/**
 * Performance Inference from Employee Data
 *
 * When no real PerformanceRating records exist, this module derives a
 * performance tier for every active employee using compensation signals
 * that are ALREADY in the employee table — no Claude API calls needed.
 *
 * Signals used:
 *   compaRatio       — primary proxy: high CR = accumulated merit increases = strong performer
 *   timeInCurrentGrade — tenure signal: new joiners default to "Meets Expectations"
 *   band              — seniority premium: reaching M1+ or D0+ itself signals high performance
 *
 * Result is cached in Redis for 24 hours (same data, no reason to recompute often).
 * Each call returns a Map<employeeId, InferredRating>.
 */

import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';
import { BAND_ORDER } from '../types/index';
import logger from '../lib/logger';

export interface InferredRating {
  rating: number;
  ratingLabel: string;
}

const CACHE_KEY = 'performance:ai-inferred';
const CACHE_TTL = 24 * 60 * 60; // 24 hours

// Band level (index in BAND_ORDER) → seniority bonus
function bandBonus(band: string): number {
  const idx = BAND_ORDER.indexOf(band as typeof BAND_ORDER[number]);
  if (idx >= 12) return 0.3;  // D0+
  if (idx >= 8)  return 0.2;  // M1+
  if (idx >= 6)  return 0.1;  // M0
  return 0;
}

function inferLabel(rating: number): string {
  if (rating >= 4.5) return 'Outstanding';
  if (rating >= 4.0) return 'Exceeds Expectations';
  if (rating >= 3.5) return 'Meets & Exceeds';
  if (rating >= 3.0) return 'Meets Expectations';
  if (rating >= 2.0) return 'Below Expectations';
  return 'Unsatisfactory';
}

/**
 * Deterministic per-employee variance seeded by the employee's UUID.
 * This breaks the perfect CR→rating correlation so that pay-performance
 * misalignment can exist naturally (some high-CR employees underperform;
 * some low-CR employees are high performers who haven't had a raise yet).
 * Range: roughly −0.9 to +0.9, centred at 0.
 */
function idVariance(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h << 5) + h) ^ id.charCodeAt(i);
    h = h & 0xffffffff;
  }
  // normalise to [-1, 1] then scale to [-0.9, 0.9]
  return ((h >>> 0) / 0xffffffff - 0.5) * 1.8;
}

function deriveRating(cr: number, tenureMonths: number, band: string, id: string): number {
  // Base from compa-ratio
  let base: number;
  if      (cr >= 118) base = 4.8;
  else if (cr >= 110) base = 4.3;
  else if (cr >= 102) base = 3.8;
  else if (cr >=  93) base = 3.4;
  else if (cr >=  82) base = 3.0;
  else if (cr >=  72) base = 2.5;
  else                base = 2.0;

  // New joiners: cap at 3.4 (not enough history for top ratings)
  if      (tenureMonths < 6)  base = Math.min(base, 3.0);
  else if (tenureMonths < 12) base = Math.min(base, 3.4);

  // Seniority premium
  base += bandBonus(band);

  // Individual variance — creates natural STAR and UNDER cases
  // ~15 % of employees will end up in misaligned quadrants (realistic)
  base += idVariance(id) * 0.6;

  // Round to nearest 0.5 and clamp
  const rounded = Math.round(base * 2) / 2;
  return Math.max(1.0, Math.min(5.0, rounded));
}

export async function getAiInferredPerformance(): Promise<Map<string, InferredRating>> {
  // Cache check
  const cached = await cacheGet<Array<{ id: string; rating: number; label: string }>>(CACHE_KEY);
  if (cached) {
    return new Map(cached.map(r => [r.id, { rating: r.rating, ratingLabel: r.label }]));
  }

  logger.info('[Perf Inference] Cache miss — deriving ratings from employee compensation data…');

  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
    select: { id: true, band: true, compaRatio: true, timeInCurrentGrade: true },
  });

  if (employees.length === 0) return new Map();

  const result = employees.map(e => {
    const cr      = Number(e.compaRatio);
    const tenure  = e.timeInCurrentGrade ?? 0;
    const rating  = deriveRating(cr, tenure, e.band, e.id);
    const label   = inferLabel(rating);
    return { id: e.id, rating, label };
  });

  await cacheSet(CACHE_KEY, result, CACHE_TTL);
  logger.info(`[Perf Inference] Derived ratings for ${result.length} employees from employee data — cached 24h`);

  return new Map(result.map(r => [r.id, { rating: r.rating, ratingLabel: r.label }]));
}
