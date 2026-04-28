/**
 * seed-real-job-architecture.ts
 *
 * Replaces the demo job architecture in the database with the real company
 * structure from "Master- Job architecture.xlsx".
 *
 * Safe to run on a live instance — employee compensation data is untouched.
 * Only the following tables are modified:
 *   Band (upsert by code — existing records survive)
 *   JobArea (delete + recreate)
 *   JobFamily (delete + recreate, cascades from JobArea)
 *   Grade (delete all + recreate under new bands)
 *   JobCode (delete + recreate, cascades from JobFamily)
 *
 * Employee.jobCodeId → nullable FK, so it becomes NULL when old codes are
 * removed. Employee band/department/salary data is untouched.
 *
 * Run:
 *   cd backend && npx ts-node scripts/seed-real-job-architecture.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Band definitions aligned to Master Job Architecture ─────────────────────
const BANDS = [
  { code: 'A1', label: 'Associate Level 1',           level: 1,  isEligibleForRSU: false },
  { code: 'A2', label: 'Associate Level 2',           level: 2,  isEligibleForRSU: false },
  { code: 'P1', label: 'Professional Level 1',        level: 3,  isEligibleForRSU: true  },
  { code: 'P2', label: 'Professional Level 2',        level: 4,  isEligibleForRSU: true  },
  { code: 'P3', label: 'Professional Level 3',        level: 5,  isEligibleForRSU: true  },
  { code: 'P4', label: 'Professional Level 4 / Expert', level: 6, isEligibleForRSU: true },
  { code: 'M0', label: 'Associate Manager',           level: 7,  isEligibleForRSU: true  },
  { code: 'M1', label: 'Manager I',                   level: 8,  isEligibleForRSU: true  },
  { code: 'M2', label: 'Manager II',                  level: 9,  isEligibleForRSU: true  },
  { code: 'M3', label: 'Senior Manager',              level: 10, isEligibleForRSU: true  },
  { code: 'D0', label: 'Associate Director',          level: 11, isEligibleForRSU: true  },
  { code: 'D1', label: 'Director',                    level: 12, isEligibleForRSU: true  },
  { code: 'D2', label: 'Senior Director',             level: 13, isEligibleForRSU: true  },
  { code: 'V0', label: 'Associate Vice President',    level: 14, isEligibleForRSU: true  },
  { code: 'V1', label: 'Vice President',              level: 15, isEligibleForRSU: true  },
  { code: 'V2', label: 'Executive Vice President',    level: 16, isEligibleForRSU: true  },
  { code: 'E0', label: 'Executive Level I',           level: 17, isEligibleForRSU: true  },
  { code: 'E1', label: 'Executive Level II',          level: 18, isEligibleForRSU: true  },
  { code: 'E2', label: 'Executive Level III',         level: 19, isEligibleForRSU: true  },
];

// ─── Job hierarchy — derived from Mastersheet - Level ────────────────────────
// Structure: { area, description, families: [{ name, roles: { bandCode: roleTitle } }] }
//
// Role titles sourced directly from the Excel mastersheet.
// NA / empty entries are omitted.
const JOB_ARCHITECTURE = [
  {
    area: 'Pre-Sales and Solutioning',
    description: 'Presales, solutioning, and solution architecture',
    families: [
      {
        name: 'Presales and Solutioning',
        roles: {
          A1: 'Associate Pre-Sales Executive',
          A2: 'Pre-Sales Executive',
          P1: 'Pre-Sales Analyst',
          P2: 'Sr. Pre-Sales Analyst',
          P3: 'Solutions Architect',
          P4: 'Senior Solutions Architect',
          M1: 'Pre-Sales Solutioning Manager',
          M2: 'Senior Manager - Solutioning',
          D0: 'Associate Director - Solutioning',
          D1: 'Director - Solutioning',
          D2: 'Senior Director - Solutioning',
        },
      },
    ],
  },
  {
    area: 'Engineering',
    description: 'Software development, data analytics, DevOps, QA, and UI engineering',
    families: [
      {
        name: 'Data Analytics',
        roles: {
          A1: 'Associate Data Engineer / Associate Power BI Developer',
          P1: 'Data Engineer / Analyst / PowerBI Developer',
          P2: 'Senior Data Engineer / Senior Power BI Developer',
          P3: 'Analytics Lead / Analytics Specialist',
          P4: 'Analytics Expert',
          M0: 'Associate Analytics Manager',
          M1: 'Analytics Manager',
          D0: 'Associate Director - Data Analytics',
          D1: 'Director - Data Analytics',
          D2: 'Sr. Director - Data Analytics',
        },
      },
      {
        name: 'Development',
        roles: {
          A1: 'Associate Software Engineer',
          P1: 'Software Engineer',
          P2: 'Senior Software Engineer',
          P3: 'Technical Lead / Technical Specialist',
          P4: 'Technical Expert',
          M0: 'Associate Technical Project Manager',
          M1: 'Technical Project Manager',
          M2: 'Sr. Technical Project Manager',
          D0: 'Associate Director - Engineering',
          D1: 'Director - Engineering',
          D2: 'Sr. Director - Engineering',
        },
      },
      {
        name: 'DevOps',
        roles: {
          A1: 'Associate DevOps Engineer',
          P1: 'DevOps Engineer',
          P2: 'Senior DevOps Engineer',
          P3: 'DevOps Specialist',
          M0: 'Associate DevOps Manager',
          M1: 'DevOps Manager',
          M2: 'Sr. DevOps Manager',
          D0: 'Associate Director - DevOps',
          D1: 'Director - DevOps',
          D2: 'Sr. Director - DevOps',
        },
      },
      {
        name: 'Product Support',
        roles: {
          A1: 'Associate Product Support Engineer',
          P1: 'Product Support Engineer',
          P2: 'Senior Product Support Engineer',
          P3: 'Product Support Lead',
          M0: 'Associate Product Support Manager',
          M1: 'Product Support Manager',
          M2: 'Sr. Product Support Manager',
          D0: 'Associate Director - Product Support',
          D1: 'Director - Product Support',
          D2: 'Sr. Director - Product Support',
        },
      },
      {
        name: 'Testing',
        roles: {
          A1: 'Associate Automation Test Engineer / Associate QA Engineer',
          P1: 'Automation Test Engineer / QA Engineer / Performance Test Engineer',
          P2: 'Senior Automation Test Engineer / Senior QA Engineer',
          P3: 'QA Lead / QA Specialist',
          M0: 'Associate QA Manager',
          M1: 'QA Expert / QA Manager',
          M2: 'Sr. QA Manager',
          D0: 'Associate Director - QA',
          D1: 'Director - QA',
          D2: 'Sr. Director - QA',
        },
      },
      {
        name: 'UI Engineering',
        roles: {
          A1: 'Associate UI Developer',
          P1: 'UI Developer',
          P2: 'Senior UI Developer',
          P3: 'UI Lead / UI Specialist',
          M0: 'Associate UI Manager',
          M1: 'UI Expert / UI Manager',
          M2: 'Sr. UI Manager',
          D0: 'Associate Director - UI',
          D1: 'Director - UI',
          D2: 'Sr. Director - UI',
        },
      },
    ],
  },
  {
    area: 'Human Resources',
    description: 'Talent acquisition, HR business partnering, HR operations, and training & development',
    families: [
      {
        name: 'Talent Acquisition',
        roles: {
          A1: 'Associate Talent Acquisition',
          A2: 'TA Specialist',
          P1: 'Sr. TA Specialist',
          P3: 'Lead - TA',
          P4: 'Lead - TA',
          M0: 'Associate Manager - TA',
          M1: 'Manager - TA',
          M2: 'Sr. Manager - TA',
          D0: 'Associate Director - TA',
          D1: 'Director - TA',
          D2: 'Senior Director - TA',
          V0: 'Associate Vice President - HR',
          V1: 'Vice President - HR',
          V2: 'Executive Vice President - HR',
        },
      },
      {
        name: 'Talent Management',
        roles: {
          A1: 'Associate HR',
          A2: 'HR Specialist',
          P1: 'HRBP',
          P3: 'Senior HRBP',
          P4: 'Senior HRBP',
          M0: 'Associate Manager - TM',
          M1: 'Manager - TM',
          M2: 'Sr. Manager - TM',
          D0: 'Associate Director - TM',
          D1: 'Director - TM',
          D2: 'Senior Director - TM',
        },
      },
      {
        name: 'HR Operations',
        roles: {
          A1: 'Associate HR Ops',
          A2: 'HR Ops Specialist',
          P1: 'Sr. HR Ops',
          P3: 'Lead - HR Ops',
          P4: 'Lead - HR Ops',
          M0: 'Associate Manager - HR Ops',
          M1: 'Manager - HR Ops',
          M2: 'Sr. Manager - HR Ops',
          D0: 'Associate Director - HR Ops',
          D1: 'Director - HR Ops',
          D2: 'Senior Director - HR Ops',
        },
      },
      {
        name: 'Training and Development',
        roles: {
          A1: 'Associate TD',
          A2: 'TD Specialist',
          P1: 'Sr. TD Specialist',
          P3: 'Lead - TD',
          P4: 'Lead - TD',
          M0: 'Associate Manager - TD',
          M1: 'Manager - TD',
          M2: 'Sr. Manager - TD',
          D0: 'Associate Director - TD',
          D1: 'Director - TD',
          D2: 'Senior Director - TD',
        },
      },
    ],
  },
  {
    area: 'Content',
    description: 'Community, editorial, product management, project management, coding, and skills consulting',
    families: [
      {
        name: 'Community',
        roles: {
          A1: 'Community Associate',
          A2: 'Sr. Community Associate',
          P1: 'Community Specialist',
          P2: 'Sr. Community Specialist',
          P3: 'Community Lead',
          M0: 'Assistant Manager - Community and Skills Development',
          M1: 'Manager - Community and Skills Development',
          M2: 'Sr. Manager - Community and Skills Consulting',
        },
      },
      {
        name: 'Editing and Proofreading',
        roles: {
          A1: 'Associate Content / Technical Editor',
          A2: 'Technical/Content Editor',
          P1: 'Editor Specialist',
          P2: 'Sr. Editor Specialist',
          P3: 'Senior / Editor Lead',
          M0: 'Assistant Manager - Editing',
          M1: 'Manager - Editing',
          M2: 'Sr. Manager - Editing',
        },
      },
      {
        name: 'Product Management',
        roles: {
          A1: 'Product Associate',
          A2: 'Sr. Product Associate',
          P1: 'Product Specialist',
          P2: 'Sr. Product Specialist',
          P3: 'Product Lead',
          P4: 'Product Consultant',
          M0: 'Assistant Manager - Product',
          M1: 'Product Manager',
          M2: 'Sr. Product Manager',
        },
      },
      {
        name: 'Project Management',
        roles: {
          A1: 'Project Associate',
          A2: 'Sr. Project Associate',
          P1: 'Project Specialist',
          P2: 'Sr. Project Specialist',
          P3: 'Project Lead',
          P4: 'Project Consultant',
          M0: 'Assistant Project Manager',
          M1: 'Project Manager',
          M2: 'Sr. Project Manager',
        },
      },
      {
        name: 'Coding and Projects',
        roles: {
          A1: 'Product Associate / Project Associate',
          A2: 'Sr. Product Associate - Coding and Projects',
          P1: 'Product Specialist - Coding and Projects',
          P2: 'Sr. Product Specialist - Coding and Projects',
          P3: 'Product Lead - Coding and Projects',
          M0: 'Assistant Manager - Coding and Projects',
          M1: 'Product Manager - Coding and Projects',
          M2: 'Sr. Product Manager - Coding and Projects',
        },
      },
      {
        name: 'Skills Consulting',
        roles: {
          A1: 'Business Analyst - Skills Consulting',
          A2: 'Sr. Business Analyst - Skills Consulting',
          P3: 'Lead Business Analyst',
          P4: 'Principal Business Analyst',
          M0: 'Associate Manager - Business Analyst',
          M1: 'Manager - Business Analyst',
          M2: 'Sr. Manager - Business Analyst',
        },
      },
    ],
  },
  {
    area: 'Product Marketing',
    description: 'Product marketing, market research, and design',
    families: [
      {
        name: 'Product Marketing',
        roles: {
          A1: 'Associate PM Executive',
          A2: 'PM Executive',
          P1: 'Associate PM Specialist',
          P2: 'PM Specialist',
          M0: 'Associate PM Manager',
          M1: 'PM Manager',
          M2: 'Senior PM Manager',
          M3: 'Associate Director - PM',
          D0: 'Director / Head - PM',
          D1: 'Sr. Director - PM',
        },
      },
      {
        name: 'Research',
        roles: {
          A1: 'Associate Research Analyst',
          A2: 'Research Analyst',
          P1: 'Sr. Research Analyst',
          P2: 'Lead Research Analyst / Specialist',
          M0: 'Associate Research Manager',
          M1: 'Research Manager',
          M2: 'Research Senior Manager',
          M3: 'Associate Director - Research',
          D0: 'Director / Head - Research',
          D1: 'Sr. Director - Research',
        },
      },
      {
        name: 'Design',
        roles: {
          A1: 'Associate Graphic Designer',
          A2: 'Graphic Designer',
          P1: 'Sr. Graphic Designer',
          P2: 'Lead Graphic Designer / Specialist',
          M0: 'Associate Design Manager',
          M1: 'Design Manager',
          M2: 'Sr. Design Manager',
          M3: 'Associate Creative Director',
          D0: 'Creative Director',
          D1: 'Design Director',
        },
      },
    ],
  },
  {
    area: 'Customer Success',
    description: 'Customer success, partner management, and customer support',
    families: [
      {
        name: 'Customer Success - Vertical 1',
        roles: {
          A1: 'Associate CS Executive',
          A2: 'CS Executive / Representative',
          P1: 'CS Specialist',
          M0: 'Associate CS Manager',
          M1: 'CS Manager',
          M2: 'Sr. CS Manager',
          D0: 'Associate Director - CS',
          D1: 'Director - CS',
          D2: 'Sr. Director - CS',
        },
      },
      {
        name: 'Customer Success - Vertical 2',
        roles: {
          M0: 'Associate CS Partner',
          M1: 'CS Partner',
          M2: 'Sr. CS Partner',
          D0: 'Associate Director CS - Partner',
          D1: 'Director CS - Partner',
          D2: 'Sr. Director CS - Partner',
        },
      },
      {
        name: 'Customer Support - Vertical 3',
        roles: {
          A1: 'Associate Customer Support Executive',
          A2: 'Customer Support Executive / Representative',
          P1: 'Customer Support Specialist',
          M0: 'Associate Customer Support Manager',
          M1: 'Customer Support Manager',
          M2: 'Senior Customer Support Manager',
          M3: 'Principal - Customer Success',
          D0: 'Associate Director - Customer Support',
          D1: 'Director - Customer Support',
          D2: 'Sr. Director - Customer Support',
        },
      },
    ],
  },
  {
    area: 'Product',
    description: 'Product management and UX design',
    families: [
      {
        name: 'Product Management',
        roles: {
          A1: 'Product Associate',
          A2: 'Product Specialist',
          P1: 'Sr. Product Specialist',
          P2: 'Associate Product Owner',
          P3: 'Product Owner',
          M0: 'Associate Product Manager',
          M1: 'Product Manager',
          M2: 'Senior Product Manager',
          D0: 'Associate Director - Product Management',
          D1: 'Director - Product Management',
          D2: 'Senior Director - Product Management',
        },
      },
      {
        name: 'UX Design',
        roles: {
          A1: 'Associate UX Designer',
          A2: 'UX Designer / Specialist',
          P1: 'Sr. UX Designer',
          P2: 'Lead UX Designer',
          P3: 'Lead UX Designer',
          M0: 'Associate Manager - UX',
          M1: 'Manager - UX',
          M2: 'Senior Manager - UX',
          D0: 'Associate Director - UX',
          D1: 'Director - UX',
          D2: 'Senior Director - UX',
        },
      },
    ],
  },
  {
    area: 'Finance',
    description: 'Financial planning, accounting, and analysis',
    families: [
      {
        name: 'Finance',
        roles: {
          A1: 'Junior Accountant',
          A2: 'Accountant',
          P1: 'Senior Accountant',
          P2: 'Finance Analyst',
          P3: 'Senior Finance Analyst',
          P4: 'Lead Finance Analyst',
          M0: 'Associate Finance Manager',
          M1: 'Finance Manager',
          M2: 'Senior Finance Manager',
          D0: 'Associate Director - Finance',
          D1: 'Director - Finance',
          D2: 'Senior Finance Director',
          V0: 'Vice President - Finance',
        },
      },
    ],
  },
  {
    area: 'Sales',
    description: 'Direct sales and account management',
    families: [
      {
        name: 'Sales',
        roles: {
          A1: 'Account Executive / Manager',
          A2: 'Senior Account Executive / Manager',
          M0: 'Associate Sales Manager',
          M1: 'Sales Manager',
          M2: 'Senior Sales Manager',
          D0: 'Associate Director - Sales',
          D1: 'Director - Sales',
          D2: 'Senior Director - Sales',
          V0: 'VP Sales',
        },
      },
    ],
  },
  {
    area: 'Channel Sales',
    description: 'Channel and partner sales management',
    families: [
      {
        name: 'Channel Sales',
        roles: {
          A1: 'Associate Channel Partner',
          A2: 'Executive Channel Partner',
          M0: 'Associate Partner Manager',
          M1: 'Partner Manager',
          M2: 'Senior Partner Manager',
          D0: 'Associate Director - Channel Sales',
          D1: 'Director - Channel Sales',
          D2: 'Senior Director - Channel Sales',
          V0: 'VP - Channel Sales',
        },
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function areaCode(area: string): string {
  const MAP: Record<string, string> = {
    'Pre-Sales and Solutioning': 'PSS',
    'Engineering':               'ENG',
    'Human Resources':           'HR',
    'Content':                   'CNT',
    'Product Marketing':         'PM',
    'Customer Success':          'CS',
    'Product':                   'PRD',
    'Finance':                   'FIN',
    'Sales':                     'SAL',
    'Channel Sales':             'CHS',
  };
  return MAP[area] || area.slice(0, 3).toUpperCase();
}

function familyCode(area: string, family: string): string {
  const MAP: Record<string, string> = {
    'Presales and Solutioning':         'PSS',
    'Data Analytics':                   'DA',
    'Development':                      'DEV',
    'DevOps':                           'OPS',
    'Product Support':                  'PS',
    'Testing':                          'TEST',
    'UI Engineering':                   'UI',
    'Talent Acquisition':               'TA',
    'Talent Management':                'TM',
    'HR Operations':                    'HRO',
    'Training and Development':         'TD',
    'Community':                        'COMM',
    'Editing and Proofreading':         'EDIT',
    'Product Management':               'PMT',
    'Project Management':               'PROJ',
    'Coding and Projects':              'CODE',
    'Skills Consulting':                'SC',
    'Product Marketing':                'MKT',
    'Research':                         'RES',
    'Design':                           'DES',
    'Customer Success - Vertical 1':    'V1',
    'Customer Success - Vertical 2':    'V2',
    'Customer Support - Vertical 3':    'V3',
    'UX Design':                        'UX',
    'Finance':                          'FIN',
    'Sales':                            'SAL',
    'Channel Sales':                    'CHS',
  };
  // Area-scoped overrides for ambiguous family names
  // (e.g. "Product Management" exists in both Content and Product areas)
  const areaScoped: Record<string, string> = {
    'Content__Product Management':       'CPMT',
    'Content__Project Management':       'CPROJ',
    'Product__Product Management':       'PRD',
  };
  const scopedKey = `${area}__${family}`;
  return areaScoped[scopedKey] || MAP[family] || family.slice(0, 4).toUpperCase();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding real company job architecture...\n');

  // 1. Upsert all bands (existing bands are updated in-place; new ones are created)
  //    Band.level has a unique constraint. Shifting existing levels first avoids
  //    transient conflicts when renumbering (e.g. old M1=6 conflicts with new P4=6
  //    until old M1 is moved to 8).
  console.log('⟳  Upserting bands...');
  await prisma.$executeRaw`UPDATE bands SET level = level + 100`;
  for (const b of BANDS) {
    await prisma.band.upsert({
      where:  { code: b.code },
      update: { label: b.label, level: b.level, isEligibleForRSU: b.isEligibleForRSU },
      create: { code: b.code,  label: b.label, level: b.level, isEligibleForRSU: b.isEligibleForRSU },
    });
  }
  console.log(`   ✅  ${BANDS.length} bands upserted`);

  // 2. Fetch the canonical band records we just upserted (need their DB IDs)
  const bandRecords = await prisma.band.findMany();
  const bandMap = new Map(bandRecords.map(b => [b.code, b]));

  // 3. Recreate grades for all bands
  console.log('⟳  Recreating grades...');
  await prisma.grade.deleteMany(); // safe — no other FK dependencies on Grade
  const gradeInserts: { bandId: string; gradeCode: string; description: string }[] = [];
  for (const b of BANDS) {
    const band = bandMap.get(b.code)!;
    gradeInserts.push({ bandId: band.id, gradeCode: `${b.code}-1`, description: b.label });
  }
  await prisma.grade.createMany({ data: gradeInserts });
  console.log(`   ✅  ${gradeInserts.length} grades created`);

  // Refresh grade map
  const gradeRecords = await prisma.grade.findMany();
  const gradeMap = new Map(gradeRecords.map(g => [g.gradeCode, g]));

  // 4. Replace job areas, families, and codes
  //    Deletion order: JobCode (cascades from JobFamily) → JobFamily (cascades from JobArea) → JobArea
  //    Employee.jobCodeId → nullable FK, automatically set to NULL by PostgreSQL on delete.
  console.log('⟳  Clearing old job areas / families / codes...');
  await prisma.jobCode.deleteMany();
  await prisma.jobFamily.deleteMany();
  await prisma.jobArea.deleteMany();
  console.log('   ✅  Old job architecture cleared');

  // 5. Create real job areas, families, and job codes
  console.log('⟳  Creating new job architecture...');
  let totalFamilies = 0;
  let totalCodes = 0;

  for (const areaData of JOB_ARCHITECTURE) {
    const area = await prisma.jobArea.create({
      data: { name: areaData.area, description: areaData.description },
    });

    for (const familyData of areaData.families) {
      const family = await prisma.jobFamily.create({
        data: { name: familyData.name, jobAreaId: area.id },
      });
      totalFamilies++;

      const aC = areaCode(areaData.area);
      const fC = familyCode(areaData.area, familyData.name);

      for (const [bandCode, roleTitle] of Object.entries(familyData.roles)) {
        const band = bandMap.get(bandCode);
        if (!band) {
          console.warn(`   ⚠  Band '${bandCode}' not found — skipping role '${roleTitle}'`);
          continue;
        }
        const grade = gradeMap.get(`${bandCode}-1`);
        const jobCode = `${aC}-${fC}-${bandCode}`;

        await prisma.jobCode.create({
          data: {
            code:        jobCode,
            title:       roleTitle,
            jobFamilyId: family.id,
            bandId:      band.id,
            gradeId:     grade?.id ?? null,
          },
        });
        totalCodes++;
      }
    }
  }

  console.log(`   ✅  ${JOB_ARCHITECTURE.length} job areas created`);
  console.log(`   ✅  ${totalFamilies} job families created`);
  console.log(`   ✅  ${totalCodes} job codes created`);

  // 6. Summary
  const [areas, families, codes, bands] = await Promise.all([
    prisma.jobArea.count(),
    prisma.jobFamily.count(),
    prisma.jobCode.count(),
    prisma.band.count(),
  ]);

  console.log('\n🎉  Done! Database now reflects the real company job architecture.');
  console.log(`\n   Bands:       ${bands}`);
  console.log(`   Job Areas:   ${areas}`);
  console.log(`   Families:    ${families}`);
  console.log(`   Job Codes:   ${codes}`);
}

main()
  .catch(e => { console.error('❌  Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
