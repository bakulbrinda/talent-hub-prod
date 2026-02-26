/**
 * clear-data.ts
 * Deletes all demo / seeded data from every table.
 * Preserves the admin user account so login still works.
 *
 * Run with:
 *   npx ts-node prisma/clear-data.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Clearing all seeded / demo data...\n');

  // ── 1. Leaf tables first (children of Employee) ──────────────
  const vestingEvents = await prisma.rsuVestingEvent.deleteMany();
  console.log(`  ✓ RSU vesting events:        ${vestingEvents.count}`);

  const rsuGrants = await prisma.rsuGrant.deleteMany();
  console.log(`  ✓ RSU grants:                ${rsuGrants.count}`);

  const achievements = await prisma.commissionAchievement.deleteMany();
  console.log(`  ✓ Commission achievements:   ${achievements.count}`);

  const plans = await prisma.commissionPlan.deleteMany();
  console.log(`  ✓ Commission plans:          ${plans.count}`);

  const ratings = await prisma.performanceRating.deleteMany();
  console.log(`  ✓ Performance ratings:       ${ratings.count}`);

  const empBenefits = await prisma.employeeBenefit.deleteMany();
  console.log(`  ✓ Employee benefits:         ${empBenefits.count}`);

  const empSkills = await prisma.employeeSkill.deleteMany();
  console.log(`  ✓ Employee skills:           ${empSkills.count}`);

  // ── 2. Employees ─────────────────────────────────────────────
  // Must null out self-referential reportingManagerId first
  await prisma.employee.updateMany({ data: { reportingManagerId: null } });
  const employees = await prisma.employee.deleteMany();
  console.log(`  ✓ Employees:                 ${employees.count}`);

  // ── 3. Scenarios ─────────────────────────────────────────────
  const scenarios = await prisma.scenario.deleteMany();
  console.log(`  ✓ Scenarios:                 ${scenarios.count}`);

  // ── 4. Notifications ─────────────────────────────────────────
  const notifications = await prisma.notification.deleteMany();
  console.log(`  ✓ Notifications:             ${notifications.count}`);

  // ── 5. AI Insights ───────────────────────────────────────────
  const aiInsights = await prisma.aiInsight.deleteMany();
  console.log(`  ✓ AI insights:               ${aiInsights.count}`);

  // ── 6. Salary & market reference data ────────────────────────
  const marketBenchmarks = await prisma.marketBenchmark.deleteMany();
  console.log(`  ✓ Market benchmarks:         ${marketBenchmarks.count}`);

  const salaryBands = await prisma.salaryBand.deleteMany();
  console.log(`  ✓ Salary bands:              ${salaryBands.count}`);

  // ── 7. Benefits catalog ──────────────────────────────────────
  const catalog = await prisma.benefitsCatalog.deleteMany();
  console.log(`  ✓ Benefits catalog:          ${catalog.count}`);

  // ── 8. Skills catalog ────────────────────────────────────────
  const skills = await prisma.skill.deleteMany();
  console.log(`  ✓ Skills:                    ${skills.count}`);

  // ── 9. Job Architecture ──────────────────────────────────────
  const jobCodes = await prisma.jobCode.deleteMany();
  console.log(`  ✓ Job codes:                 ${jobCodes.count}`);

  const grades = await prisma.grade.deleteMany();
  console.log(`  ✓ Grades:                    ${grades.count}`);

  const jobFamilies = await prisma.jobFamily.deleteMany();
  console.log(`  ✓ Job families:              ${jobFamilies.count}`);

  const jobAreas = await prisma.jobArea.deleteMany();
  console.log(`  ✓ Job areas:                 ${jobAreas.count}`);

  const bands = await prisma.band.deleteMany();
  console.log(`  ✓ Bands:                     ${bands.count}`);

  // ── 10. Refresh tokens (keep admin user, just expire sessions) ─
  const tokens = await prisma.refreshToken.deleteMany();
  console.log(`  ✓ Refresh tokens:            ${tokens.count}`);

  console.log('\n✅  All demo data removed.');
  console.log('   Admin account (admin@company.com) preserved — ready for real data.\n');
}

main()
  .catch((e) => { console.error('❌  Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
