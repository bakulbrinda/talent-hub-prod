/**
 * Wipes all transactional/employee data while preserving:
 * - Admin user + auth
 * - Job architecture (bands, job areas/families, grades, job codes)
 * - Salary bands
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('Wiping transactional data (keeping job architecture + admin)...');

  await p.rsuVestingEvent.deleteMany({});        console.log('✓ rsuVestingEvent');
  await p.rsuGrant.deleteMany({});               console.log('✓ rsuGrant');
  await p.employeeBenefit.deleteMany({});        console.log('✓ employeeBenefit');
  await p.commissionAchievement.deleteMany({});  console.log('✓ commissionAchievement');
  await p.commissionPlan.deleteMany({});         console.log('✓ commissionPlan');
  await p.performanceRating.deleteMany({});      console.log('✓ performanceRating');
  await p.employeeSkill.deleteMany({});          console.log('✓ employeeSkill');
  await p.aiInsight.deleteMany({});              console.log('✓ aiInsight');
  await p.notification.deleteMany({});           console.log('✓ notification');
  await p.auditLog.deleteMany({});               console.log('✓ auditLog');
  await p.employee.deleteMany({});               console.log('✓ employee');
  await p.scenario.deleteMany({});               console.log('✓ scenario');
  await p.benefitsCatalog.deleteMany({});        console.log('✓ benefitsCatalog');
  await p.marketBenchmark.deleteMany({});        console.log('✓ marketBenchmark');

  const [users, bands, salaryBands] = await Promise.all([
    p.user.count(),
    p.band.count(),
    p.salaryBand.count(),
  ]);

  console.log('\n✅ Done. Clean slate for real data entry.');
  console.log(`   Admin users:   ${users}`);
  console.log(`   Bands:         ${bands}`);
  console.log(`   Salary bands:  ${salaryBands}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
