/**
 * load-job-details-from-excel.ts
 *
 * One-time data loader: reads HR structure.xlsx and populates
 * the 7 detail fields on JobCode records via Prisma.
 * The fields remain fully editable in the UI after this runs.
 *
 * Usage:
 *   cd backend
 *   npx ts-node scripts/load-job-details-from-excel.ts
 */

import * as path from 'path';
import * as xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ─────────────────────────────────────────────────────────────────

function clean(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s : null;
}

/** Read a sheet and return rows as arrays (skip header row 0) */
function readSheet(wb: xlsx.WorkBook, name: string): string[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet "${name}" not found`);
  const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  return rows.slice(1) as string[][]; // skip header
}

// ── Column layout ────────────────────────────────────────────────────────────
// TM / HR Ops / TD sheets:  col3=Band#  col4=JobFunction  col5=ReportsTo  col6=RoleSummary
//                            col7=RoleResponsibilities  col8=ManagerResp  col9=EduExp  col10=Skills
//
// TA sheet:  col3 is empty, col4 has Band# (shifted) → no jobFunction column
//            col5=ReportsTo  col6=RoleSummary  col7=Responsibilities  col8=ManagerResp
//            col9=EduExp  col10=Skills

interface DetailFields {
  jobFunction: string | null;
  reportsTo: string | null;
  roleSummary: string | null;
  roleResponsibilities: string | null;
  managerResponsibility: string | null;
  educationExperience: string | null;
  skillsRequired: string | null;
}

function extractStandard(row: string[]): DetailFields {
  return {
    jobFunction:          clean(row[4]),
    reportsTo:            clean(row[5]),
    roleSummary:          clean(row[6]),
    roleResponsibilities: clean(row[7]),
    managerResponsibility:clean(row[8]),
    educationExperience:  clean(row[9]),
    skillsRequired:       clean(row[10]),
  };
}

function extractTA(row: string[]): DetailFields {
  // TA sheet col4 holds the band number, not job function
  return {
    jobFunction:          'Talent Acquisition',
    reportsTo:            clean(row[5]),
    roleSummary:          clean(row[6]),
    roleResponsibilities: clean(row[7]),
    managerResponsibility:clean(row[8]),
    educationExperience:  clean(row[9]),
    skillsRequired:       clean(row[10]),
  };
}

// ── Role → job code mapping ──────────────────────────────────────────────────
// We match Excel role names to DB job code codes.
// A single Excel role can map to multiple DB codes (e.g. both P3 and P4 for same level).

interface Mapping {
  roleName: string;
  codes: string[];
  extract: (row: string[]) => DetailFields;
}

const TA_MAPPINGS: Mapping[] = [
  { roleName: 'Associate TA',                   codes: ['HR-TA-A1'],         extract: extractTA },
  { roleName: 'Talent Acquisition Specialist',  codes: ['HR-TA-A2'],         extract: extractTA },
  { roleName: 'Sr. Talent Acquisiton Specialist',codes: ['HR-TA-P1'],        extract: extractTA },
  { roleName: 'Lead - TA',                      codes: ['HR-TA-P3', 'HR-TA-P4'], extract: extractTA },
  { roleName: 'Assistant Mgr - TA',             codes: ['HR-TA-M0'],         extract: extractTA },
  { roleName: 'Mgr - TA',                       codes: ['HR-TA-M1'],         extract: extractTA },
  { roleName: 'Sr. Mgr - TA',                   codes: ['HR-TA-M2'],         extract: extractTA },
];

const TM_MAPPINGS: Mapping[] = [
  { roleName: 'Junior HRBP',                    codes: ['HR-TM-A1'],         extract: extractStandard },
  { roleName: 'HRBP',                           codes: ['HR-TM-P1'],         extract: extractStandard },
  { roleName: 'Senior HRBP',                    codes: ['HR-TM-P3', 'HR-TM-P4'], extract: extractStandard },
  { roleName: 'Sr. Manager - Talent Engagement',codes: ['HR-TM-M2'],         extract: extractStandard },
];

const HRO_MAPPINGS: Mapping[] = [
  { roleName: 'HR Ops - IC',                    codes: ['HR-HRO-A1'],        extract: extractStandard },
  { roleName: 'HR Ops Specialist',              codes: ['HR-HRO-A2'],        extract: extractStandard },
  { roleName: 'Senior HR Ops',                  codes: ['HR-HRO-P1'],        extract: extractStandard },
  { roleName: 'Lead - HR Ops',                  codes: ['HR-HRO-P3', 'HR-HRO-P4'], extract: extractStandard },
  { roleName: 'Assistant Mgr - Hr Ops',         codes: ['HR-HRO-M0'],        extract: extractStandard },
  { roleName: 'Manager - HR Ops',               codes: ['HR-HRO-M1'],        extract: extractStandard },
  { roleName: 'Senior Manager - HR Ops',        codes: ['HR-HRO-M2'],        extract: extractStandard },
];

const TD_MAPPINGS: Mapping[] = [
  { roleName: 'TD - IC',                        codes: ['HR-TD-A1'],         extract: extractStandard },
  { roleName: 'TD Specialist',                  codes: ['HR-TD-A2'],         extract: extractStandard },
  { roleName: 'Sr. TD Specialist',              codes: ['HR-TD-P1'],         extract: extractStandard },
  { roleName: 'Lead - TD',                      codes: ['HR-TD-P3', 'HR-TD-P4'], extract: extractStandard },
  { roleName: 'Assistant Mgr - TD',             codes: ['HR-TD-M0'],         extract: extractStandard },
  { roleName: 'Mgr- TD',                        codes: ['HR-TD-M1'],         extract: extractStandard },
  { roleName: 'Sr. Mgr - TD',                   codes: ['HR-TD-M2'],         extract: extractStandard },
];

const SHEET_CONFIG: Array<{ sheet: string; mappings: Mapping[] }> = [
  { sheet: 'TA',     mappings: TA_MAPPINGS  },
  { sheet: 'TM',     mappings: TM_MAPPINGS  },
  { sheet: 'HR Ops', mappings: HRO_MAPPINGS },
  { sheet: 'TD',     mappings: TD_MAPPINGS  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const excelPath = path.resolve(__dirname, '../../HR structure.xlsx');
  console.log(`Reading: ${excelPath}\n`);

  const wb = xlsx.readFile(excelPath);

  let updated = 0;
  let skipped = 0;

  for (const { sheet, mappings } of SHEET_CONFIG) {
    console.log(`── Sheet: ${sheet} ──`);
    const rows = readSheet(wb, sheet);

    for (const row of rows) {
      const roleName = clean(row[2]);
      if (!roleName) continue;

      // Find mapping by exact role name match (case-insensitive, trimmed)
      const mapping = mappings.find(
        m => m.roleName.trim().toLowerCase() === roleName.toLowerCase()
      );

      if (!mapping) {
        console.log(`  SKIP (no mapping): "${roleName}"`);
        skipped++;
        continue;
      }

      const fields = mapping.extract(row);

      for (const code of mapping.codes) {
        const record = await prisma.jobCode.findFirst({ where: { code } });
        if (!record) {
          console.log(`  WARN: job code "${code}" not found in DB`);
          skipped++;
          continue;
        }

        await prisma.jobCode.update({
          where: { id: record.id },
          data: {
            jobFunction:          fields.jobFunction,
            reportsTo:            fields.reportsTo,
            roleSummary:          fields.roleSummary,
            roleResponsibilities: fields.roleResponsibilities,
            managerResponsibility:fields.managerResponsibility,
            educationExperience:  fields.educationExperience,
            skillsRequired:       fields.skillsRequired,
          },
        });

        console.log(`  ✓ ${code} ← "${roleName}"`);
        updated++;
      }
    }
    console.log();
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
