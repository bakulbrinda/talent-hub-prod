import { PrismaClient } from '@prisma/client';

const BAND_ORDER = ['A1','A2','P1','P2','P3','P4','M0','M1','M2','M3','D0','D1','D2','V0','V1','V2','E0','E1','E2'];

const prisma = new PrismaClient();

async function main() {
  const employees = await prisma.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { id: true, band: true, compaRatio: true, timeInCurrentGrade: true },
  });

  let updated = 0;
  for (const emp of employees) {
    const bandIdx = BAND_ORDER.indexOf(emp.band);
    let attritionScore = 0;
    const cr = Number(emp.compaRatio);

    if (emp.compaRatio !== null) {
      if (cr < 80) attritionScore += 40;
      else if (cr < 90) attritionScore += 25;
      else if (cr < 95) attritionScore += 12;
    }

    const months = emp.timeInCurrentGrade ?? 0;
    if (months > 48) attritionScore += 30;
    else if (months > 36) attritionScore += 20;
    else if (months > 24) attritionScore += 12;
    else if (months > 18) attritionScore += 6;

    if (bandIdx >= 0 && bandIdx <= 1) attritionScore += 15;
    else if (bandIdx >= 2 && bandIdx <= 4) attritionScore += 8;

    const attritionRiskScore = Math.min(100, attritionScore);

    await prisma.employee.update({
      where: { id: emp.id },
      data: { attritionRiskScore },
    });
    updated++;
  }

  console.log(`Attrition risk scores computed for ${updated} employees`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
