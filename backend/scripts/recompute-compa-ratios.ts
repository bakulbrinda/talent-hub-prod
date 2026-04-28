import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { id: true, band: true, annualFixed: true, dateOfJoining: true },
  });

  const salaryBands = await prisma.salaryBand.findMany({ include: { band: true } });
  const bandMap = new Map(salaryBands.map(sb => [sb.band.code, sb]));

  let updated = 0;
  let skipped = 0;
  for (const emp of employees) {
    const sb = bandMap.get(emp.band);
    if (!sb) { skipped++; continue; }

    const mid = Number(sb.midSalary);
    const min = Number(sb.minSalary);
    const max = Number(sb.maxSalary);
    const annualFixed = Number(emp.annualFixed);
    if (mid === 0) { skipped++; continue; }

    const compaRatio = (annualFixed / mid) * 100;
    const payRangePenetration = max > min ? ((annualFixed - min) / (max - min)) * 100 : null;
    const now = new Date();
    const joining = new Date(emp.dateOfJoining);
    const timeInCurrentGrade = Math.floor(
      (now.getTime() - joining.getTime()) / (1000 * 60 * 60 * 24 * 30),
    );

    await prisma.employee.update({
      where: { id: emp.id },
      data: {
        compaRatio,
        ...(payRangePenetration !== null ? { payRangePenetration } : {}),
        timeInCurrentGrade,
      },
    });
    updated++;
  }

  console.log(`Done — updated: ${updated}, skipped: ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
