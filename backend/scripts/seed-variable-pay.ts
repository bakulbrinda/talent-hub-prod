/**
 * Seed commission plans + achievements without touching employees.
 * Run: npx ts-node -r tsconfig-paths/register --project tsconfig.json scripts/seed-variable-pay.ts
 */
import { PrismaClient, CommissionPlanType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding variable pay data...');

  await prisma.commissionAchievement.deleteMany();
  await prisma.commissionPlan.deleteMany();

  // ── Plans ──────────────────────────────────────────────────────────────────
  const salesPlan = await prisma.commissionPlan.create({
    data: {
      name: 'Sales Quota Plan',
      targetVariablePercent: 30,
      planType: CommissionPlanType.SALES,
      acceleratorTiers: [
        { threshold: 100, multiplier: 1.0, label: 'On Target' },
        { threshold: 110, multiplier: 1.15, label: 'Accelerator I' },
        { threshold: 125, multiplier: 1.30, label: 'Accelerator II' },
        { threshold: 150, multiplier: 1.60, label: 'Club' },
      ],
      effectiveFrom: new Date('2024-01-01'),
      effectiveTo: new Date('2024-12-31'),
    },
  });

  const perfPlan = await prisma.commissionPlan.create({
    data: {
      name: 'Performance Bonus Plan',
      targetVariablePercent: 15,
      planType: CommissionPlanType.PERFORMANCE,
      acceleratorTiers: [
        { threshold: 90, multiplier: 0.8, label: 'Partial' },
        { threshold: 100, multiplier: 1.0, label: 'On Target' },
        { threshold: 115, multiplier: 1.2, label: 'Stretch' },
      ],
      effectiveFrom: new Date('2024-01-01'),
      effectiveTo: new Date('2024-12-31'),
    },
  });

  const hybridPlan = await prisma.commissionPlan.create({
    data: {
      name: 'Leadership Hybrid Plan',
      targetVariablePercent: 20,
      planType: CommissionPlanType.HYBRID,
      acceleratorTiers: [
        { threshold: 100, multiplier: 1.0, label: 'On Target' },
        { threshold: 120, multiplier: 1.25, label: 'Overachiever' },
      ],
      effectiveFrom: new Date('2024-01-01'),
      effectiveTo: new Date('2024-12-31'),
    },
  });

  console.log('✅ Created 3 commission plans');

  // ── Fetch employees ────────────────────────────────────────────────────────
  const salesEmps = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', department: 'Sales' },
    select: { id: true, annualFixed: true },
    take: 15,
  });
  const engEmps = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', department: 'Engineering' },
    select: { id: true, annualFixed: true },
    take: 12,
  });
  const mgmtEmps = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE', band: { in: ['P3', 'P4'] } },
    select: { id: true, annualFixed: true },
    take: 8,
  });

  console.log(`Found ${salesEmps.length} Sales, ${engEmps.length} Eng, ${mgmtEmps.length} Leadership employees`);

  const salesPcts = [142, 118, 95, 107, 88, 125, 135, 97, 73, 115, 103, 89, 156, 112, 99];
  const engPcts   = [102, 96, 88, 115, 109, 93, 121, 78, 105, 98, 113, 86];
  const mgmtPcts  = [108, 124, 95, 117, 89, 133, 101, 112];

  const rows: any[] = [];

  // Sales — 3 quarters
  for (const period of ['2024-Q2', '2024-Q3', '2024-Q4']) {
    for (let i = 0; i < salesEmps.length; i++) {
      const pct = salesPcts[i % salesPcts.length];
      const target = Math.round(Number(salesEmps[i].annualFixed) * 0.30 / 4);
      const achieved = Math.round(target * pct / 100);
      const mult = pct >= 150 ? 1.60 : pct >= 125 ? 1.30 : pct >= 110 ? 1.15 : 1.0;
      rows.push({ employeeId: salesEmps[i].id, planId: salesPlan.id, period, targetAmount: target, achievedAmount: achieved, achievementPercent: pct, payoutAmount: Math.round(target * mult * pct / 100) });
    }
  }

  // Engineering — 3 quarters
  for (const period of ['2024-Q2', '2024-Q3', '2024-Q4']) {
    for (let i = 0; i < engEmps.length; i++) {
      const pct = engPcts[i % engPcts.length];
      const target = Math.round(Number(engEmps[i].annualFixed) * 0.15 / 4);
      const achieved = Math.round(target * pct / 100);
      const mult = pct >= 115 ? 1.2 : pct >= 100 ? 1.0 : 0.8;
      rows.push({ employeeId: engEmps[i].id, planId: perfPlan.id, period, targetAmount: target, achievedAmount: achieved, achievementPercent: pct, payoutAmount: Math.round(target * mult * pct / 100) });
    }
  }

  // Leadership — 2 quarters
  for (const period of ['2024-Q3', '2024-Q4']) {
    for (let i = 0; i < mgmtEmps.length; i++) {
      const pct = mgmtPcts[i % mgmtPcts.length];
      const target = Math.round(Number(mgmtEmps[i].annualFixed) * 0.20 / 4);
      const achieved = Math.round(target * pct / 100);
      const mult = pct >= 120 ? 1.25 : 1.0;
      rows.push({ employeeId: mgmtEmps[i].id, planId: hybridPlan.id, period, targetAmount: target, achievedAmount: achieved, achievementPercent: pct, payoutAmount: Math.round(target * mult * pct / 100) });
    }
  }

  await prisma.commissionAchievement.createMany({ data: rows });
  console.log(`✅ Created ${rows.length} commission achievements`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
