/**
 * Seeds missing salary bands + performance ratings into the existing DB.
 * Safe to run on a live DB — uses upsert/createMany with skipDuplicates.
 * Run: node scripts/seed-missing-data.js
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// ── Salary band ranges by band code (INR) ─────────────────────
const BAND_RANGES = {
  A1:  { min:  300000, mid:   450000, max:   600000 },
  A2:  { min:  600000, mid:   800000, max:  1000000 },
  P1:  { min:  900000, mid:  1200000, max:  1500000 },
  P2:  { min: 1400000, mid:  1900000, max:  2400000 },
  P3:  { min: 2200000, mid:  3000000, max:  3800000 },
  P4:  { min: 3000000, mid:  4000000, max:  5000000 },
  M0:  { min: 3500000, mid:  4500000, max:  5500000 },
  M1:  { min: 4500000, mid:  6000000, max:  7500000 },
  M2:  { min: 6500000, mid:  8500000, max: 10500000 },
  M3:  { min: 9000000, mid: 12000000, max: 15000000 },
  D0:  { min:12000000, mid: 15000000, max: 19000000 },
  D1:  { min:16000000, mid: 20000000, max: 25000000 },
  D2:  { min:20000000, mid: 25000000, max: 32000000 },
  V0:  { min:25000000, mid: 32000000, max: 40000000 },
  V1:  { min:30000000, mid: 40000000, max: 50000000 },
  V2:  { min:40000000, mid: 55000000, max: 70000000 },
  E0:  { min:50000000, mid: 70000000, max: 90000000 },
  E1:  { min:70000000, mid: 90000000, max:120000000 },
  E2:  { min:90000000, mid:120000000, max:150000000 },
};

// Performance rating distribution (rating → weight)
const PERF_DIST = [
  { rating: 5.0, label: 'Exceptional',          weight: 5  },
  { rating: 4.5, label: 'Exceeds Expectations',  weight: 15 },
  { rating: 4.0, label: 'Meets Expectations',    weight: 50 },
  { rating: 3.5, label: 'Developing',            weight: 20 },
  { rating: 3.0, label: 'Needs Improvement',     weight: 10 },
];

function pickRating(seed) {
  const total = PERF_DIST.reduce((s, d) => s + d.weight, 0);
  let roll = seed % total;
  for (const d of PERF_DIST) {
    if (roll < d.weight) return d;
    roll -= d.weight;
  }
  return PERF_DIST[2];
}

async function main() {
  // ── 1. Salary Bands ──────────────────────────────────────────
  const bands = await p.band.findMany({ orderBy: { level: 'asc' } });
  const existing = await p.salaryBand.findMany({ select: { bandId: true } });
  const existingBandIds = new Set(existing.map(s => s.bandId));

  const now = new Date();
  let bandsCreated = 0;

  for (const band of bands) {
    if (existingBandIds.has(band.id)) {
      console.log(`  skip  ${band.code} — salary band already exists`);
      continue;
    }
    const range = BAND_RANGES[band.code];
    if (!range) {
      console.log(`  skip  ${band.code} — no range defined`);
      continue;
    }
    await p.salaryBand.create({
      data: {
        bandId:      band.id,
        jobAreaId:   null,         // global band (applies to all job areas)
        effectiveDate: now,
        minSalary:   range.min,
        midSalary:   range.mid,
        maxSalary:   range.max,
        currency:    'INR',
      },
    });
    console.log(`  ✓  ${band.code}  ₹${(range.min/100000).toFixed(0)}L – ₹${(range.mid/100000).toFixed(0)}L – ₹${(range.max/100000).toFixed(0)}L`);
    bandsCreated++;
  }
  console.log(`\nSalary bands created: ${bandsCreated}\n`);

  // ── 2. Recalculate compa-ratios for all active employees ─────
  const employees = await p.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { id: true, band: true, annualFixed: true },
  });

  const salaryBands = await p.salaryBand.findMany({ include: { band: true } });
  const bandMap = new Map(salaryBands.map(sb => [sb.band.code, sb]));

  let compaUpdated = 0;
  await Promise.all(
    employees.map(async (emp) => {
      const sb = bandMap.get(emp.band);
      if (!sb) return;
      const mid = Number(sb.midSalary);
      const min = Number(sb.minSalary);
      const max = Number(sb.maxSalary);
      if (mid === 0) return;
      const annualFixed = Number(emp.annualFixed);
      const compaRatio = (annualFixed / mid) * 100;
      const payRangePenetration = max > min ? ((annualFixed - min) / (max - min)) * 100 : null;
      await p.employee.update({
        where: { id: emp.id },
        data: {
          compaRatio,
          ...(payRangePenetration !== null && { payRangePenetration }),
        },
      });
      compaUpdated++;
    })
  );
  console.log(`Compa-ratios updated: ${compaUpdated}/${employees.length}\n`);

  // ── 3. Performance Ratings ───────────────────────────────────
  const existingRatings = await p.performanceRating.count();
  if (existingRatings > 0) {
    console.log(`Performance ratings already exist (${existingRatings}) — skipping\n`);
  } else {
    const CYCLE = '2024-25';
    const ratings = employees.map((emp, i) => {
      const pick = pickRating(i * 7 + 3); // deterministic pseudo-random
      return {
        employeeId: emp.id,
        cycle: CYCLE,
        rating: pick.rating,
        ratingLabel: pick.label,
        reviewedBy: 'HR System',
      };
    });

    // createMany in batches of 200
    const BATCH = 200;
    let ratingsCreated = 0;
    for (let i = 0; i < ratings.length; i += BATCH) {
      await p.performanceRating.createMany({
        data: ratings.slice(i, i + BATCH),
        skipDuplicates: true,
      });
      ratingsCreated += Math.min(BATCH, ratings.length - i);
    }
    console.log(`Performance ratings created: ${ratingsCreated} (cycle: ${CYCLE})\n`);
  }

  // ── 4. Verify ────────────────────────────────────────────────
  const [finalBands, finalRatings, withCompa, avgAgg, outside] = await Promise.all([
    p.salaryBand.count(),
    p.performanceRating.count(),
    p.employee.count({ where: { compaRatio: { not: null } } }),
    p.employee.aggregate({ where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } }, _avg: { compaRatio: true } }),
    p.employee.count({ where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] } }),
  ]);

  console.log('─── Final State ───────────────────────────────');
  console.log(`Salary bands:         ${finalBands}`);
  console.log(`Performance ratings:  ${finalRatings}`);
  console.log(`Employees w/ compa:   ${withCompa}/${employees.length}`);
  console.log(`Avg compa-ratio:      ${Number(avgAgg._avg.compaRatio || 0).toFixed(1)}%`);
  console.log(`Outside band (80-120):${outside}`);
  console.log('───────────────────────────────────────────────');

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
