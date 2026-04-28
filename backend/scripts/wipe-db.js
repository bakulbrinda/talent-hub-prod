const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  console.log('Wiping all data...');

  // Delete in dependency order (children before parents)
  await p.rsuVestingEvent.deleteMany({});           console.log('✓ rsuVestingEvent');
  await p.rsuGrant.deleteMany({});                  console.log('✓ rsuGrant');
  await p.employeeBenefit.deleteMany({});           console.log('✓ employeeBenefit');
  await p.commissionAchievement.deleteMany({});     console.log('✓ commissionAchievement');
  await p.commissionPlan.deleteMany({});            console.log('✓ commissionPlan');
  await p.performanceRating.deleteMany({});         console.log('✓ performanceRating');
  await p.employeeSkill.deleteMany({});             console.log('✓ employeeSkill');
  await p.aiInsight.deleteMany({});                 console.log('✓ aiInsight');
  await p.notification.deleteMany({});              console.log('✓ notification');
  await p.auditLog.deleteMany({});                  console.log('✓ auditLog');
  await p.employee.deleteMany({});                  console.log('✓ employee');
  await p.scenario.deleteMany({});                  console.log('✓ scenario');
  await p.salaryBand.deleteMany({});                console.log('✓ salaryBand');
  await p.marketBenchmark.deleteMany({});           console.log('✓ marketBenchmark');
  await p.benefitsCatalog.deleteMany({});           console.log('✓ benefitsCatalog');
  await p.skill.deleteMany({});                     console.log('✓ skill');
  await p.userInvite.deleteMany({});                console.log('✓ userInvite');
  await p.refreshToken.deleteMany({});              console.log('✓ refreshToken');
  await p.user.deleteMany({});                      console.log('✓ user');
  await p.jobCode.deleteMany({});                   console.log('✓ jobCode');
  await p.grade.deleteMany({});                     console.log('✓ grade');
  await p.band.deleteMany({});                      console.log('✓ band');
  await p.jobFamily.deleteMany({});                 console.log('✓ jobFamily');
  await p.jobArea.deleteMany({});                   console.log('✓ jobArea');

  console.log('\n✅ All data wiped. Database is empty.');
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
