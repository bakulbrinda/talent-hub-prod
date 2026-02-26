/**
 * reconnect-data.ts
 * Derives all dependent data from the real employees already in the DB.
 * Run with:  npx ts-node prisma/reconnect-data.ts
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();

const BAND_LEVEL: Record<string, number> = {
  A1: 1, A2: 2, P1: 3, P2: 4, P3: 5, M1: 6, M2: 7, D0: 8, D1: 9, D2: 10,
};
const RSU_ELIGIBLE_LEVEL = 4; // P2 and above

async function main() {
  console.log('🔗  Reconnecting employee data to all platform modules...\n');

  // ── 0. Fetch all employees ────────────────────────────────────────────────
  const employees = await prisma.employee.findMany();
  console.log(`  Found ${employees.length} employees\n`);

  // ── 1. Create Band records ────────────────────────────────────────────────
  const existingBands = await prisma.band.findMany();
  if (existingBands.length === 0) {
    const bandDefs = [
      { code: 'A1', label: 'Associate 1',  level: 1,  isEligibleForRSU: false },
      { code: 'A2', label: 'Associate 2',  level: 2,  isEligibleForRSU: false },
      { code: 'P1', label: 'Professional 1', level: 3, isEligibleForRSU: false },
      { code: 'P2', label: 'Professional 2', level: 4, isEligibleForRSU: true },
      { code: 'P3', label: 'Professional 3', level: 5, isEligibleForRSU: true },
      { code: 'M1', label: 'Manager 1',    level: 6,  isEligibleForRSU: true },
      { code: 'M2', label: 'Manager 2',    level: 7,  isEligibleForRSU: true },
      { code: 'D0', label: 'Director 0',   level: 8,  isEligibleForRSU: true },
      { code: 'D1', label: 'Director 1',   level: 9,  isEligibleForRSU: true },
      { code: 'D2', label: 'Director 2',   level: 10, isEligibleForRSU: true },
    ];
    await prisma.band.createMany({ data: bandDefs });
    console.log(`  ✓ Bands created: ${bandDefs.length}`);
  } else {
    console.log(`  ✓ Bands already exist: ${existingBands.length}`);
  }

  const allBands = await prisma.band.findMany();
  const bandById = new Map(allBands.map(b => [b.code, b]));

  // ── 2. Salary Bands: derive min/mid/max from actual employee salaries ──────
  const existingSalaryBands = await prisma.salaryBand.count();
  if (existingSalaryBands === 0) {
    const bySalaryBand: Record<string, number[]> = {};
    for (const e of employees) {
      if (!bySalaryBand[e.band]) bySalaryBand[e.band] = [];
      bySalaryBand[e.band].push(Number(e.annualFixed));
    }

    const salaryBandData: any[] = [];
    for (const [code, salaries] of Object.entries(bySalaryBand)) {
      const bandRec = bandById.get(code);
      if (!bandRec) continue;
      salaries.sort((a, b) => a - b);
      const mid = salaries[Math.floor(salaries.length / 2)];
      // Standard HR band: mid ±25%
      const min = Math.round(mid * 0.75);
      const max = Math.round(mid * 1.25);
      salaryBandData.push({
        bandId: bandRec.id,
        effectiveDate: new Date('2024-04-01'),
        minSalary: min,
        midSalary: mid,
        maxSalary: max,
        currency: 'INR',
      });
    }
    await prisma.salaryBand.createMany({ data: salaryBandData });
    console.log(`  ✓ Salary bands created: ${salaryBandData.length}`);
  } else {
    console.log(`  ✓ Salary bands already exist: ${existingSalaryBands}`);
  }

  // ── 3. Compute compaRatio for all employees ───────────────────────────────
  const salaryBands = await prisma.salaryBand.findMany();
  const midBySalaryBand: Record<string, number> = {};
  for (const sb of salaryBands) {
    const band = allBands.find(b => b.id === sb.bandId);
    if (band) midBySalaryBand[band.code] = Number(sb.midSalary);
  }

  let compaUpdated = 0;
  for (const emp of employees) {
    const mid = midBySalaryBand[emp.band];
    if (!mid) continue;
    const compaRatio = Math.round((Number(emp.annualFixed) / mid) * 100);
    await prisma.employee.update({
      where: { id: emp.id },
      data: { compaRatio },
    });
    compaUpdated++;
  }
  console.log(`  ✓ compaRatio computed for ${compaUpdated} employees`);

  // ── 4. Performance ratings ────────────────────────────────────────────────
  const existingRatings = await prisma.performanceRating.count();
  if (existingRatings === 0) {
    // Rank employees by compaRatio within their band, assign ratings:
    // top 15% → 5 (Outstanding), next 25% → 4 (Exceeds), middle 35% → 3 (Meets),
    // next 20% → 2 (Below Expectations), bottom 5% → 1 (Needs Improvement)
    const updatedEmps = await prisma.employee.findMany({ orderBy: { compaRatio: 'desc' } });
    const n = updatedEmps.length;
    const ratingThresholds = [
      { up: Math.floor(n * 0.15), rating: 5.0, label: 'Outstanding' },
      { up: Math.floor(n * 0.40), rating: 4.0, label: 'Exceeds Expectations' },
      { up: Math.floor(n * 0.75), rating: 3.0, label: 'Meets Expectations' },
      { up: Math.floor(n * 0.95), rating: 2.0, label: 'Below Expectations' },
      { up: n,                    rating: 1.0, label: 'Needs Improvement' },
    ];

    const ratingData: any[] = [];
    for (let i = 0; i < updatedEmps.length; i++) {
      const e = updatedEmps[i];
      const tier = ratingThresholds.find(t => i < t.up)!;
      // Add a small variation (±0.5 max) to avoid all employees having the same exact rating
      const variation = (Math.random() - 0.5) * 0.4;
      const finalRating = Math.min(5, Math.max(1, parseFloat((tier.rating + variation).toFixed(2))));
      ratingData.push({
        employeeId: e.id,
        cycle: '2025-H1',
        rating: finalRating,
        ratingLabel: tier.label,
        reviewedBy: 'System',
      });
    }
    // Also add a previous cycle
    const ratingDataPrev: any[] = updatedEmps.map((e, i) => {
      const tier = ratingThresholds.find(t => i < t.up)!;
      const variation = (Math.random() - 0.5) * 0.6;
      const finalRating = Math.min(5, Math.max(1, parseFloat((tier.rating + variation).toFixed(2))));
      return {
        employeeId: e.id,
        cycle: '2024-H2',
        rating: finalRating,
        ratingLabel: tier.label,
        reviewedBy: 'System',
      };
    });

    await prisma.performanceRating.createMany({ data: ratingData });
    await prisma.performanceRating.createMany({ data: ratingDataPrev });
    console.log(`  ✓ Performance ratings created: ${ratingData.length * 2} (2 cycles × ${ratingData.length} employees)`);
  } else {
    console.log(`  ✓ Performance ratings already exist: ${existingRatings}`);
  }

  // ── 5. RSU Grants ─────────────────────────────────────────────────────────
  const existingRsu = await prisma.rsuGrant.count();
  if (existingRsu === 0) {
    const rsuEligible = employees.filter(e => (BAND_LEVEL[e.band] ?? 0) >= RSU_ELIGIBLE_LEVEL);
    const unitsByBand: Record<string, number> = {
      P2: 500, P3: 800, M1: 1200, M2: 1800, D0: 2500, D1: 3500, D2: 5000,
    };
    const today = new Date();
    const grantData: any[] = [];
    const vestingData: any[] = [];

    for (const e of rsuEligible) {
      const totalUnits = unitsByBand[e.band] ?? 600;
      const grantDate = new Date(e.dateOfJoining);
      grantDate.setMonth(grantDate.getMonth() + 12); // Grant after 1 year
      if (grantDate > today) continue; // Skip if grant date in future

      const priceAtGrant = 100 + Math.random() * 150; // ₹100-250
      const currentPrice = priceAtGrant * (1 + (Math.random() * 0.8 - 0.1)); // -10% to +70%

      const monthsSinceGrant = Math.floor((today.getTime() - grantDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const vestedPercent = Math.min(100, Math.max(0, Math.floor((Math.max(0, monthsSinceGrant - 12) / 48) * 100)));
      const vestedUnits = Math.floor(totalUnits * vestedPercent / 100);

      const grantRec: any = {
        employeeId: e.id,
        grantDate,
        totalUnits,
        vestedUnits,
        vestingScheduleMonths: 48,
        cliffMonths: 12,
        vestingPercent: 25,
        priceAtGrant: parseFloat(priceAtGrant.toFixed(2)),
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        status: 'ACTIVE',
      };
      grantData.push(grantRec);
    }

    for (const g of grantData) {
      const created = await prisma.rsuGrant.create({ data: g });
      // Create vesting events (annual cliff + quarterly)
      const cliff = new Date(g.grantDate);
      cliff.setMonth(cliff.getMonth() + 12);
      if (cliff <= today) {
        const cliffUnits = Math.floor(g.totalUnits * 0.25);
        vestingData.push({ rsuGrantId: created.id, vestingDate: cliff, unitsVesting: cliffUnits, isVested: true, vestedAt: cliff });
      }
      // Quarterly vesting after cliff
      for (let q = 1; q <= 12; q++) {
        const qDate = new Date(g.grantDate);
        qDate.setMonth(qDate.getMonth() + 12 + q * 3);
        if (qDate > today) break;
        const qUnits = Math.floor(g.totalUnits * 0.0625); // 6.25% per quarter
        vestingData.push({ rsuGrantId: created.id, vestingDate: qDate, unitsVesting: qUnits, isVested: true, vestedAt: qDate });
      }
    }

    if (vestingData.length > 0) {
      await prisma.rsuVestingEvent.createMany({ data: vestingData });
    }
    console.log(`  ✓ RSU grants created: ${grantData.length} (${vestingData.length} vesting events)`);
  } else {
    console.log(`  ✓ RSU grants already exist: ${existingRsu}`);
  }

  // ── 6. Commission Plans + Achievements ───────────────────────────────────
  const existingPlans = await prisma.commissionPlan.count();
  if (existingPlans === 0) {
    const salesPlan = await prisma.commissionPlan.create({
      data: {
        name: 'Sales Commission Plan 2025',
        targetVariablePercent: 20,
        planType: 'SALES',
        effectiveFrom: new Date('2025-01-01'),
        acceleratorTiers: [
          { threshold: 80,  multiplier: 0.8  },
          { threshold: 100, multiplier: 1.0  },
          { threshold: 120, multiplier: 1.3  },
          { threshold: 150, multiplier: 1.6  },
        ],
      },
    });
    const perfPlan = await prisma.commissionPlan.create({
      data: {
        name: 'Performance Bonus Plan 2025',
        targetVariablePercent: 15,
        planType: 'PERFORMANCE',
        effectiveFrom: new Date('2025-01-01'),
        acceleratorTiers: [
          { threshold: 80,  multiplier: 0.75 },
          { threshold: 100, multiplier: 1.0  },
          { threshold: 120, multiplier: 1.2  },
        ],
      },
    });

    const salesEmps = employees.filter(e => e.department === 'Sales');
    const perfEmps  = employees.filter(e => e.department !== 'Sales');
    const periods   = ['2024-Q3', '2024-Q4', '2025-Q1'];
    const achieveData: any[] = [];

    for (const e of salesEmps) {
      for (const period of periods) {
        const target   = Number(e.annualFixed) * 0.20;
        const pct      = 70 + Math.random() * 80; // 70–150%
        const achieved = target * pct / 100;
        const tier     = salesPlan.acceleratorTiers as any[];
        const mult     = tier.reverse().find((t: any) => pct >= t.threshold)?.multiplier ?? 1;
        achieveData.push({
          employeeId: e.id,
          planId: salesPlan.id,
          period,
          targetAmount: parseFloat(target.toFixed(2)),
          achievedAmount: parseFloat(achieved.toFixed(2)),
          achievementPercent: parseFloat(pct.toFixed(2)),
          payoutAmount: parseFloat((target * mult).toFixed(2)),
        });
      }
    }
    for (const e of perfEmps.slice(0, 20)) {
      const period = '2025-Q1';
      const target   = Number(e.annualFixed) * 0.15;
      const pct      = 60 + Math.random() * 80;
      const achieved = target * pct / 100;
      achieveData.push({
        employeeId: e.id,
        planId: perfPlan.id,
        period,
        targetAmount: parseFloat(target.toFixed(2)),
        achievedAmount: parseFloat(achieved.toFixed(2)),
        achievementPercent: parseFloat(pct.toFixed(2)),
        payoutAmount: parseFloat((target * Math.min(pct / 100, 1.2)).toFixed(2)),
      });
    }

    await prisma.commissionAchievement.createMany({ data: achieveData });
    console.log(`  ✓ Commission plans: 2 | achievements: ${achieveData.length}`);
  } else {
    console.log(`  ✓ Commission plans already exist: ${existingPlans}`);
  }

  // ── 7. Employee Benefits: ensure all employees enrolled in Medical ────────
  const medicalBenefit = await prisma.benefitsCatalog.findFirst({ where: { name: 'Comprehensive Medical Insurance' } });
  if (medicalBenefit) {
    const alreadyEnrolled = new Set(
      (await prisma.employeeBenefit.findMany({ where: { benefitId: medicalBenefit.id }, select: { employeeId: true } }))
        .map(e => e.employeeId)
    );
    const toEnroll = employees.filter(e => !alreadyEnrolled.has(e.id));
    if (toEnroll.length > 0) {
      await prisma.employeeBenefit.createMany({
        data: toEnroll.map(e => ({
          employeeId: e.id,
          benefitId: medicalBenefit.id,
          enrolledAt: new Date(),
          status: 'ACTIVE',
          utilizationPercent: Math.floor(Math.random() * 60) + 10,
          utilizedValue: Math.floor(Math.random() * 200000) + 50000,
        })),
      });
      console.log(`  ✓ Medical insurance enrolled: ${toEnroll.length} new employees`);
    }
  }

  // ── 8. Clear Redis cache ──────────────────────────────────────────────────
  try {
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true, enableOfflineQueue: false });
    await redis.connect();
    const keys = await redis.keys('*');
    if (keys.length > 0) await redis.del(...keys);
    redis.disconnect();
    console.log(`  ✓ Redis cache cleared (${keys.length} keys)`);
  } catch {
    console.log('  ⚠  Redis not available — cache not cleared (data will refresh on next request)');
  }

  console.log('\n✅  All modules reconnected successfully!');
  console.log('   Pay equity, salary bands, performance, RSU, variable pay & benefits are now live.\n');
}

main()
  .catch(e => { console.error('❌  Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
