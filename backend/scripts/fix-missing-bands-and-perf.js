/**
 * Fixes the 3 missing band records (M0, P4, M3) that exist in employee data
 * but have no Band or SalaryBand records. Also seeds performance ratings.
 * Run: node scripts/fix-missing-bands-and-perf.js
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const MISSING_BANDS = [
  { code: 'P4', label: 'Staff Professional', level: 11, isEligibleForRSU: true,
    salary: { min: 3000000, mid: 4000000, max: 5000000 } },
  { code: 'M0', label: 'Associate Manager', level: 12, isEligibleForRSU: true,
    salary: { min: 3500000, mid: 4500000, max: 5500000 } },
  { code: 'M3', label: 'Senior Director', level: 13, isEligibleForRSU: true,
    salary: { min: 9000000, mid: 12000000, max: 15000000 } },
];

const PERF_DIST = [
  { rating: 5.0, label: 'Exceptional',         weight: 5  },
  { rating: 4.5, label: 'Exceeds Expectations', weight: 15 },
  { rating: 4.0, label: 'Meets Expectations',   weight: 50 },
  { rating: 3.5, label: 'Developing',           weight: 20 },
  { rating: 3.0, label: 'Needs Improvement',    weight: 10 },
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
  console.log('=== Fix Missing Bands + Seed Performance Ratings ===\n');

  // ── 1. Create Band records ──────────────────────────────────────
  for (const b of MISSING_BANDS) {
    const existing = await p.band.findUnique({ where: { code: b.code } });
    if (existing) {
      console.log(`  skip Band ${b.code} — already exists`);
      continue;
    }
    await p.band.create({
      data: { code: b.code, label: b.label, level: b.level, isEligibleForRSU: b.isEligibleForRSU },
    });
    console.log(`  ✓ Band ${b.code} created`);
  }

  // ── 2. Create SalaryBand records ────────────────────────────────
  const now = new Date();
  for (const b of MISSING_BANDS) {
    const band = await p.band.findUnique({ where: { code: b.code } });
    if (!band) continue;
    const exists = await p.salaryBand.findFirst({ where: { bandId: band.id } });
    if (exists) {
      console.log(`  skip SalaryBand ${b.code} — already exists`);
      continue;
    }
    await p.salaryBand.create({
      data: {
        bandId: band.id,
        jobAreaId: null,
        effectiveDate: now,
        minSalary: b.salary.min,
        midSalary: b.salary.mid,
        maxSalary: b.salary.max,
        currency: 'INR',
      },
    });
    console.log(`  ✓ SalaryBand ${b.code}: ₹${b.salary.min/100000}L – ₹${b.salary.mid/100000}L – ₹${b.salary.max/100000}L`);
  }

  // ── 3. Recalculate compaRatio for ALL active employees ──────────
  console.log('\nRecalculating compa-ratios...');
  const employees = await p.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { id: true, band: true, annualFixed: true },
  });

  const salaryBands = await p.salaryBand.findMany({ include: { band: true } });
  const bandMap = new Map(salaryBands.map(sb => [sb.band.code, sb]));

  let compaUpdated = 0;
  await Promise.all(employees.map(async (emp) => {
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
      data: { compaRatio, ...(payRangePenetration !== null && { payRangePenetration }) },
    });
    compaUpdated++;
  }));
  console.log(`  ✓ Compa-ratios updated: ${compaUpdated}/${employees.length}`);

  // ── 4. Seed Performance Ratings ─────────────────────────────────
  const existingRatings = await p.performanceRating.count();
  if (existingRatings > 0) {
    console.log(`\n  skip Performance ratings — ${existingRatings} already exist`);
  } else {
    console.log('\nSeeding performance ratings...');
    const CYCLE = 'FY2024-25';
    const allEmployees = await p.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: { id: true },
    });
    const ratings = allEmployees.map((emp, i) => {
      const pick = pickRating(i * 7 + 3);
      return {
        employeeId: emp.id,
        cycle: CYCLE,
        rating: pick.rating,
        ratingLabel: pick.label,
        reviewedBy: 'HR System',
      };
    });
    const BATCH = 200;
    let created = 0;
    for (let i = 0; i < ratings.length; i += BATCH) {
      await p.performanceRating.createMany({ data: ratings.slice(i, i + BATCH), skipDuplicates: true });
      created += Math.min(BATCH, ratings.length - i);
    }
    console.log(`  ✓ Performance ratings created: ${created} (cycle: ${CYCLE})`);
  }

  // ── 5. Verify ────────────────────────────────────────────────────
  const [withCompa, totalActive, perfCount, outside] = await Promise.all([
    p.employee.count({ where: { compaRatio: { not: null } } }),
    p.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    p.performanceRating.count(),
    p.employee.count({ where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] } }),
  ]);
  const avgAgg = await p.employee.aggregate({ where: { compaRatio: { not: null } }, _avg: { compaRatio: true } });

  console.log('\n─── Final State ─────────────────────────────');
  console.log(`Employees with compaRatio: ${withCompa}/${totalActive}`);
  console.log(`Avg compa-ratio:           ${Number(avgAgg._avg.compaRatio || 0).toFixed(1)}%`);
  console.log(`Outside band (80-120):     ${outside}`);
  console.log(`Performance ratings:       ${perfCount}`);
  console.log('─────────────────────────────────────────────');

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
