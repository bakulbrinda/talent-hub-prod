/**
 * seed-job-architecture.ts
 * Seeds JobArea → JobFamily → Grade → JobCode hierarchy
 * derived from the actual employee dataset.
 * Run with:  npx ts-node prisma/seed-job-architecture.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🏗️  Seeding Job Architecture...\n');

  // ── Guard: skip if already populated ─────────────────────────────────────
  const existing = await prisma.jobArea.count();
  if (existing > 0) {
    console.log(`  ⚠  Job Areas already exist (${existing}). Skipping.\n`);
    return;
  }

  // ── Fetch bands (must exist) ──────────────────────────────────────────────
  const bands = await prisma.band.findMany({ orderBy: { level: 'asc' } });
  if (bands.length === 0) throw new Error('No Band records found — run reconnect-data.ts first');
  const bandMap = new Map(bands.map(b => [b.code, b]));

  // ── 1. Grades (one per band) ──────────────────────────────────────────────
  const gradeLabels: Record<string, string> = {
    A1: 'G1', A2: 'G2', P1: 'G3', P2: 'G4', P3: 'G5',
    M1: 'G6', M2: 'G7', D0: 'G8', D1: 'G9', D2: 'G10',
  };
  const gradeMap = new Map<string, string>(); // bandCode → grade.id
  for (const band of bands) {
    const gradeCode = gradeLabels[band.code];
    const grade = await prisma.grade.create({
      data: { bandId: band.id, gradeCode, description: `${band.label} – ${gradeCode}` },
    });
    gradeMap.set(band.code, grade.id);
  }
  console.log(`  ✓ Grades created: ${bands.length}`);

  // ── 2. Job Areas ──────────────────────────────────────────────────────────
  const areaDefs = [
    { name: 'Engineering',  description: 'Software engineering, architecture & technical leadership' },
    { name: 'Finance',      description: 'Financial planning, analysis & reporting' },
    { name: 'HR',           description: 'Human resources, talent management & people operations' },
    { name: 'Marketing',    description: 'Brand, content, digital marketing & campaigns' },
    { name: 'Operations',   description: 'Business operations, process excellence & analytics' },
    { name: 'Sales',        description: 'Revenue, account management & sales strategy' },
  ];
  const areaMap = new Map<string, string>(); // name → id
  for (const a of areaDefs) {
    const rec = await prisma.jobArea.create({ data: a });
    areaMap.set(a.name, rec.id);
  }
  console.log(`  ✓ Job Areas created: ${areaDefs.length}`);

  // ── 3. Job Families ───────────────────────────────────────────────────────
  const familyDefs: { area: string; name: string }[] = [
    { area: 'Engineering',  name: 'Software Development' },
    { area: 'Engineering',  name: 'Technical Leadership' },
    { area: 'Finance',      name: 'Financial Analysis' },
    { area: 'Finance',      name: 'Financial Management' },
    { area: 'HR',           name: 'HR Operations' },
    { area: 'HR',           name: 'Talent Management' },
    { area: 'Marketing',    name: 'Brand & Content' },
    { area: 'Marketing',    name: 'Marketing Operations' },
    { area: 'Operations',   name: 'Business Operations' },
    { area: 'Operations',   name: 'Process Excellence' },
    { area: 'Sales',        name: 'Account Management' },
    { area: 'Sales',        name: 'Sales Operations' },
  ];
  const familyMap = new Map<string, string>(); // "area|family" → id
  for (const f of familyDefs) {
    const rec = await prisma.jobFamily.create({
      data: { name: f.name, jobAreaId: areaMap.get(f.area)! },
    });
    familyMap.set(`${f.area}|${f.name}`, rec.id);
  }
  console.log(`  ✓ Job Families created: ${familyDefs.length}`);

  // ── 4. Job Codes ──────────────────────────────────────────────────────────
  // Derived from actual employee department × band combinations
  const jobCodeDefs: { code: string; title: string; area: string; family: string; band: string }[] = [
    // Engineering
    { code: 'ENG-A1-001', title: 'Associate Engineer',         area: 'Engineering', family: 'Software Development', band: 'A1' },
    { code: 'ENG-A2-001', title: 'Engineer',                   area: 'Engineering', family: 'Software Development', band: 'A2' },
    { code: 'ENG-P1-001', title: 'Senior Engineer',            area: 'Engineering', family: 'Software Development', band: 'P1' },
    { code: 'ENG-P3-001', title: 'Staff Engineer',             area: 'Engineering', family: 'Software Development', band: 'P3' },
    { code: 'ENG-P3-002', title: 'Engineering Manager',        area: 'Engineering', family: 'Technical Leadership',  band: 'P3' },
    { code: 'ENG-M1-001', title: 'Senior Engineering Manager', area: 'Engineering', family: 'Technical Leadership',  band: 'M1' },
    { code: 'ENG-D1-001', title: 'Engineering Director',       area: 'Engineering', family: 'Technical Leadership',  band: 'D1' },

    // Finance
    { code: 'FIN-A2-001', title: 'Finance Associate',          area: 'Finance', family: 'Financial Analysis',   band: 'A2' },
    { code: 'FIN-P1-001', title: 'Financial Analyst',          area: 'Finance', family: 'Financial Analysis',   band: 'P1' },
    { code: 'FIN-P2-001', title: 'Senior Financial Analyst',   area: 'Finance', family: 'Financial Analysis',   band: 'P2' },
    { code: 'FIN-P3-001', title: 'Finance Lead',               area: 'Finance', family: 'Financial Management', band: 'P3' },
    { code: 'FIN-P3-002', title: 'Finance Manager',            area: 'Finance', family: 'Financial Management', band: 'P3' },
    { code: 'FIN-D1-001', title: 'Finance Director',           area: 'Finance', family: 'Financial Management', band: 'D1' },

    // HR
    { code: 'HR-A1-001',  title: 'HR Associate',               area: 'HR', family: 'HR Operations',     band: 'A1' },
    { code: 'HR-P1-001',  title: 'HR Specialist',              area: 'HR', family: 'HR Operations',     band: 'P1' },
    { code: 'HR-P2-001',  title: 'Senior HR Business Partner', area: 'HR', family: 'Talent Management', band: 'P2' },
    { code: 'HR-P3-001',  title: 'HR Manager',                 area: 'HR', family: 'Talent Management', band: 'P3' },
    { code: 'HR-P3-002',  title: 'HR Lead',                    area: 'HR', family: 'Talent Management', band: 'P3' },

    // Marketing
    { code: 'MKT-A1-001', title: 'Marketing Associate',        area: 'Marketing', family: 'Brand & Content',       band: 'A1' },
    { code: 'MKT-P1-001', title: 'Marketing Analyst',          area: 'Marketing', family: 'Marketing Operations',  band: 'P1' },
    { code: 'MKT-P2-001', title: 'Marketing Manager',          area: 'Marketing', family: 'Marketing Operations',  band: 'P2' },
    { code: 'MKT-P2-002', title: 'Brand Manager',              area: 'Marketing', family: 'Brand & Content',       band: 'P2' },
    { code: 'MKT-P3-001', title: 'Senior Marketing Executive', area: 'Marketing', family: 'Marketing Operations',  band: 'P3' },
    { code: 'MKT-M1-001', title: 'Marketing Director',         area: 'Marketing', family: 'Brand & Content',       band: 'M1' },
    { code: 'MKT-M1-002', title: 'Sr Marketing Manager',       area: 'Marketing', family: 'Marketing Operations',  band: 'M1' },
    { code: 'MKT-D0-001', title: 'VP Marketing',               area: 'Marketing', family: 'Brand & Content',       band: 'D0' },
    { code: 'MKT-D1-001', title: 'Marketing Director II',      area: 'Marketing', family: 'Brand & Content',       band: 'D1' },
    { code: 'MKT-D2-001', title: 'Chief Marketing Officer',    area: 'Marketing', family: 'Brand & Content',       band: 'D2' },

    // Operations
    { code: 'OPS-P1-001', title: 'Operations Analyst',         area: 'Operations', family: 'Business Operations', band: 'P1' },
    { code: 'OPS-P3-001', title: 'Operations Executive',       area: 'Operations', family: 'Business Operations', band: 'P3' },
    { code: 'OPS-P3-002', title: 'Process Analyst',            area: 'Operations', family: 'Process Excellence',  band: 'P3' },
    { code: 'OPS-M1-001', title: 'Operations Manager',         area: 'Operations', family: 'Business Operations', band: 'M1' },
    { code: 'OPS-M1-002', title: 'Process Excellence Manager', area: 'Operations', family: 'Process Excellence',  band: 'M1' },

    // Sales
    { code: 'SAL-P1-001', title: 'Sales Executive',            area: 'Sales', family: 'Account Management', band: 'P1' },
    { code: 'SAL-P3-001', title: 'Senior Sales Executive',     area: 'Sales', family: 'Account Management', band: 'P3' },
    { code: 'SAL-P3-002', title: 'Sales Analyst',              area: 'Sales', family: 'Sales Operations',   band: 'P3' },
    { code: 'SAL-P3-003', title: 'Sales Manager',              area: 'Sales', family: 'Account Management', band: 'P3' },
    { code: 'SAL-M2-001', title: 'Sales Director',             area: 'Sales', family: 'Account Management', band: 'M2' },
  ];

  let jobCodesCreated = 0;
  for (const jc of jobCodeDefs) {
    const band = bandMap.get(jc.band);
    if (!band) continue;
    const familyId = familyMap.get(`${jc.area}|${jc.family}`);
    if (!familyId) continue;
    const gradeId = gradeMap.get(jc.band);
    await prisma.jobCode.create({
      data: {
        code: jc.code,
        title: jc.title,
        jobFamilyId: familyId,
        bandId: band.id,
        gradeId: gradeId ?? undefined,
      },
    });
    jobCodesCreated++;
  }
  console.log(`  ✓ Job Codes created: ${jobCodesCreated}`);

  // ── 5. Update salary bands to link to relevant job areas ─────────────────
  // Associate salary bands with job areas (gives the range editor filters)
  const salaryBands = await prisma.salaryBand.findMany({ include: { band: true } });
  const areaOrder = ['Engineering', 'Finance', 'HR', 'Marketing', 'Operations', 'Sales'];
  for (const sb of salaryBands) {
    // Link each salary band to a different area to show variety in the range editor
    const areaName = areaOrder[sb.band.level % areaOrder.length];
    const areaId = areaMap.get(areaName);
    if (areaId) {
      await prisma.salaryBand.update({ where: { id: sb.id }, data: { jobAreaId: areaId } });
    }
  }
  console.log(`  ✓ Salary bands linked to job areas`);

  console.log('\n✅  Job Architecture seeded successfully!\n');
}

main()
  .catch(e => { console.error('❌  Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
