/**
 * One-shot script: recomputes compaRatio + derived fields for ALL active employees.
 * Run: npx ts-node scripts/recalc-all.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function computeDerived(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { jobCode: { include: { jobFamily: { include: { jobArea: true } } } } },
  });
  if (!employee) return;

  const jobAreaId = employee.jobCode?.jobFamily?.jobArea?.id;
  let salaryBand = await prisma.salaryBand.findFirst({
    where: {
      band: { code: employee.band },
      ...(jobAreaId ? { jobAreaId } : {}),
    },
  });
  if (!salaryBand) {
    salaryBand = await prisma.salaryBand.findFirst({ where: { band: { code: employee.band } } });
  }
  if (!salaryBand) return; // no band record, skip

  const annualFixed = Number(employee.annualFixed) || 0;
  const midSalary = Number(salaryBand.midSalary) || 0;
  const minSalary = Number(salaryBand.minSalary) || 0;
  const maxSalary = Number(salaryBand.maxSalary) || 0;

  const compaRatio = midSalary > 0 ? (annualFixed / midSalary) * 100 : null;
  if (compaRatio === null) return;

  await prisma.employee.update({
    where: { id: employeeId },
    data: { compaRatio },
  });
}

async function main() {
  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { id: true, firstName: true, lastName: true, band: true },
  });

  console.log(`Recalculating ${employees.length} employees...`);
  let done = 0;
  let skipped = 0;

  const results = await Promise.allSettled(
    employees.map(e => computeDerived(e.id))
  );

  for (const r of results) {
    if (r.status === 'fulfilled') done++;
    else { skipped++; console.error('Failed:', r.reason); }
  }

  // Verify
  const withCompa = await prisma.employee.count({
    where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
  });
  const avgAgg = await prisma.employee.aggregate({
    where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
    _avg: { compaRatio: true },
  });
  console.log(`\nDone: ${done} updated, ${skipped} skipped`);
  console.log(`Employees with compaRatio: ${withCompa}/${employees.length}`);
  console.log(`Avg compa-ratio: ${Number(avgAgg._avg.compaRatio || 0).toFixed(1)}%`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
