/**
 * Seeds realistic benefits utilization data for all 200 employees.
 * RSU Grants (EQUITY) are the primary focus — vesting % is tenure-based,
 * grant value is band-based. All other benefits also populated with realistic data.
 *
 * Run: npx ts-node --project tsconfig.json scripts/seed-benefits-utilization.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── RSU grant value by band (total grant in ₹) ──────────────────────────────
const RSU_GRANT_BY_BAND: Record<string, [number, number]> = {
  A1: [0, 0],          // not eligible
  A2: [0, 0],          // not eligible
  P1: [150000, 300000], // ₹1.5L–3L
  P2: [400000, 700000], // ₹4L–7L
  P3: [800000, 1500000],// ₹8L–15L
  M1: [1500000, 2500000],// ₹15L–25L
  M2: [2500000, 4000000],// ₹25L–40L
  D0: [4000000, 6000000],// ₹40L–60L
  D1: [6000000, 8000000],// ₹60L–80L
  D2: [8000000,12000000],// ₹80L–1.2Cr
};

function rng(seed: number, min: number, max: number): number {
  // deterministic pseudo-random using seed
  const x = Math.sin(seed) * 10000;
  const r = x - Math.floor(x);
  return Math.round(min + r * (max - min));
}

function vestingPct(dateOfJoining: Date): number {
  const tenureMs = Date.now() - new Date(dateOfJoining).getTime();
  const tenureYears = tenureMs / (1000 * 60 * 60 * 24 * 365.25);
  if (tenureYears < 1) return 0;
  if (tenureYears < 2) return 25;
  if (tenureYears < 3) return 50;
  if (tenureYears < 4) return 75;
  return 100;
}

async function main() {
  console.log('Loading employees and benefits catalog...');

  const [employees, catalog] = await Promise.all([
    prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: { id: true, employeeId: true, band: true, gender: true, department: true, annualFixed: true, dateOfJoining: true },
    }),
    prisma.benefitsCatalog.findMany({ where: { isActive: true } }),
  ]);

  const benefitMap = new Map(catalog.map(b => [b.name, b]));
  const rsuBenefit = benefitMap.get('RSU Grant')!;
  const medicalBenefit = benefitMap.get('Comprehensive Medical Insurance')!;
  const parentalBenefit = benefitMap.get('Parental Medical Insurance')!;
  const wellnessBenefit = benefitMap.get('Mental Health on Loop')!;
  const learningBenefit = benefitMap.get('Training & Learning Allowance')!;
  const offsiteBenefit = benefitMap.get('Annual Company Offsite')!;
  const mochaBenefit = benefitMap.get('Mochaccino Award')!;
  const tuxedoBenefit = benefitMap.get('TuxedoMocha Award')!;

  console.log(`Processing ${employees.length} employees...`);

  let upserted = 0;
  const now = new Date();

  for (let idx = 0; idx < employees.length; idx++) {
    const e = employees[idx];
    const seed = idx + 1;
    const records: { benefitId: string; utilizationPct: number; utilizedValue: number }[] = [];

    // ── Comprehensive Medical Insurance: everyone enrolled ──────────────────
    records.push({
      benefitId: medicalBenefit.id,
      utilizationPct: rng(seed * 3, 30, 95),
      utilizedValue: Math.round(rng(seed * 4, 90000, 270000) / 1000) * 1000,
    });

    // ── Parental Medical Insurance: married employees (roughly 60%) ─────────
    if (seed % 5 !== 0) { // ~80% enrolled
      records.push({
        benefitId: parentalBenefit.id,
        utilizationPct: rng(seed * 7, 20, 80),
        utilizedValue: Math.round(rng(seed * 8, 50000, 240000) / 1000) * 1000,
      });
    }

    // ── Mental Health on Loop: ~70% enrolled ────────────────────────────────
    if (seed % 3 !== 0) {
      records.push({
        benefitId: wellnessBenefit.id,
        utilizationPct: rng(seed * 11, 10, 75),
        utilizedValue: Math.round(rng(seed * 12, 3600, 32400) / 100) * 100,
      });
    }

    // ── Training & Learning: everyone enrolled, utilization varies by band ──
    const learningBasePct = ['P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'].includes(e.band) ? 60 : 35;
    records.push({
      benefitId: learningBenefit.id,
      utilizationPct: rng(seed * 5, learningBasePct, Math.min(100, learningBasePct + 35)),
      utilizedValue: Math.round(rng(seed * 6, 8000, 25000) / 500) * 500,
    });

    // ── Annual Company Offsite: everyone ─────────────────────────────────────
    records.push({
      benefitId: offsiteBenefit.id,
      utilizationPct: rng(seed * 13, 60, 100),
      utilizedValue: rng(seed * 14, 12000, 15000),
    });

    // ── Mochaccino Award: ~40% of employees received it ─────────────────────
    if (seed % 5 <= 1) {
      records.push({
        benefitId: mochaBenefit.id,
        utilizationPct: 100,
        utilizedValue: 10000,
      });
    }

    // ── TuxedoMocha Award: top performers ~20% ──────────────────────────────
    if (seed % 5 === 0) {
      records.push({
        benefitId: tuxedoBenefit.id,
        utilizationPct: 100,
        utilizedValue: 5000,
      });
    }

    // ── RSU Grant: P1 and above only ────────────────────────────────────────
    const grantRange = RSU_GRANT_BY_BAND[e.band];
    if (grantRange && grantRange[1] > 0) {
      const totalGrant = rng(seed * 17, grantRange[0], grantRange[1]);
      const vPct = vestingPct(e.dateOfJoining);
      const vestedValue = Math.round(totalGrant * vPct / 100);
      records.push({
        benefitId: rsuBenefit.id,
        utilizationPct: vPct,
        utilizedValue: vestedValue,
      });
    }

    // Upsert all records for this employee
    for (const rec of records) {
      await prisma.employeeBenefit.upsert({
        where: { employeeId_benefitId: { employeeId: e.id, benefitId: rec.benefitId } },
        update: { utilizationPercent: rec.utilizationPct, utilizedValue: rec.utilizedValue, status: 'ACTIVE' },
        create: {
          employeeId: e.id,
          benefitId: rec.benefitId,
          enrolledAt: now,
          status: 'ACTIVE',
          utilizationPercent: rec.utilizationPct,
          utilizedValue: rec.utilizedValue,
        },
      });
      upserted++;
    }

    if ((idx + 1) % 50 === 0) console.log(`  ${idx + 1}/${employees.length} processed...`);
  }

  // Bust benefits cache
  await prisma.$executeRaw`SELECT 1`; // ensure connection stays alive

  const rsuCount = await prisma.employeeBenefit.count({
    where: { benefit: { category: 'EQUITY' }, status: 'ACTIVE' },
  });

  console.log(`\n✅ Done — ${upserted} benefit enrollment records upserted`);
  console.log(`   RSU Grant records: ${rsuCount}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
