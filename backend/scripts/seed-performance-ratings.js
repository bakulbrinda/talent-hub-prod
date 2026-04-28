/**
 * Seeds realistic performance ratings for all active employees.
 * Distribution: 15% stars(5), 25% high(4), 35% meets(3), 18% below(2), 7% poor(1)
 * Creates ratings for FY2023-24 and FY2024-25 cycles.
 */
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const p = new PrismaClient();

// Weighted random: higher bands skew toward better ratings
function getRating(band) {
  const seniorBands = ['M1','M2','D0','D1','D2'];
  const midBands    = ['P2','P3','P4','M0'];
  const junior      = ['A1','A2','P1'];

  let weights;
  if (seniorBands.includes(band))      weights = [7, 30, 38, 18, 7];   // [1,2,3,4,5]
  else if (midBands.includes(band))    weights = [7, 18, 38, 28, 9];
  else                                 weights = [7, 18, 35, 25, 15];

  const total = weights.reduce((a,b) => a+b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return i + 1;
  }
  return 3;
}

const LABEL = { 1:'Needs Improvement', 2:'Below Expectations', 3:'Meets Expectations', 4:'Exceeds Expectations', 5:'Outstanding' };

async function main() {
  const existing = await p.performanceRating.count();
  if (existing > 0) { console.log(`Already have ${existing} ratings — skipping.`); await p.$disconnect(); return; }

  const employees = await p.employee.findMany({
    where: { employmentStatus: 'ACTIVE' },
    select: { id: true, band: true, firstName: true }
  });

  console.log(`Seeding performance ratings for ${employees.length} employees...`);

  const cycles = ['FY2023-24', 'FY2024-25'];
  const records = [];

  for (const emp of employees) {
    let prevRating = null;
    for (const cycle of cycles) {
      let rating = getRating(emp.band);
      // Slight consistency: rating stays within ±1 of previous cycle
      if (prevRating !== null) {
        const drift = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
        rating = Math.max(1, Math.min(5, prevRating + drift));
      }
      prevRating = rating;
      records.push({
        employeeId: emp.id,
        cycle,
        rating,
        ratingLabel: LABEL[rating],
        reviewedBy: 'System',
      });
    }
  }

  // Batch insert in chunks of 500
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    await p.performanceRating.createMany({ data: records.slice(i, i + BATCH), skipDuplicates: true });
    process.stdout.write(`  ${Math.min(i + BATCH, records.length)}/${records.length}\r`);
  }

  const dist = records.reduce((acc, r) => { acc[r.ratingLabel] = (acc[r.ratingLabel]||0)+1; return acc; }, {});
  console.log('\n✅ Done!');
  console.log('Distribution (FY2024-25 cycle):');
  Object.entries(dist).forEach(([label, count]) => console.log(`  ${label}: ${count}`));
  await p.$disconnect();
}

main().catch(e => { console.error(e); p.$disconnect(); process.exit(1); });
