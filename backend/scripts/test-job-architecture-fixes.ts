/// <reference types="node" />
/**
 * Smoke test for Job Architecture bug-audit fixes.
 *
 * Calls the service layer directly against the live DB. Creates rows prefixed
 * with `__test_` and cleans up in `finally`. Exits non-zero on any failure.
 *
 * Run: cd backend && npx ts-node scripts/test-job-architecture-fixes.ts
 */
import { prisma } from '../src/lib/prisma';
import { jobArchitectureService } from '../src/services/jobArchitecture.service';
import {
  createJobAreaSchema,
  updateJobAreaSchema,
  createJobFamilySchema,
  createBandSchema,
  updateBandSchema,
  createGradeSchema,
  createJobCodeSchema,
  updateJobCodeSchema,
} from '../src/schemas/jobArchitecture.schemas';

const TAG = '__test_';
let passed = 0;
let failed = 0;
const failures: string[] = [];

const PASS = (name: string) => { passed++; console.log(`PASS: ${name}`); };
const FAIL = (name: string, reason: string) => {
  failed++;
  const line = `FAIL: ${name} — ${reason}`;
  failures.push(line);
  console.error(line);
};

async function expectThrow(name: string, fn: () => Promise<unknown>, code?: string) {
  try {
    await fn();
    FAIL(name, 'expected throw, got success');
  } catch (e: any) {
    if (code && e.code !== code && !(e?.issues && code === 'VALIDATION_ERROR')) {
      FAIL(name, `expected code ${code}, got ${e.code ?? e.name ?? e.message}`);
    } else {
      PASS(name);
    }
  }
}

async function expectOk<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const r = await fn();
    PASS(name);
    return r;
  } catch (e: any) {
    FAIL(name, e.message ?? String(e));
    return null;
  }
}

async function cleanup() {
  // Delete in dependency order
  await prisma.jobCode.deleteMany({ where: { code: { startsWith: TAG.toUpperCase() } } });
  await prisma.grade.deleteMany({ where: { gradeCode: { startsWith: TAG.toUpperCase() } } });
  await prisma.salaryBand.deleteMany({ where: { band: { code: { startsWith: TAG.toUpperCase() } } } });
  await prisma.band.deleteMany({ where: { code: { startsWith: TAG.toUpperCase() } } });
  await prisma.jobFamily.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.jobArea.deleteMany({ where: { name: { startsWith: TAG } } });
}

async function run() {
  console.log('=== Job Architecture Fix Smoke Test ===\n');
  await cleanup();

  // ─── JobArea ──────────────────────────────────────────────────
  console.log('\n--- JobArea ---');
  // 1. Zod rejects empty name
  await expectThrow('JobArea.create rejects empty name', async () => {
    createJobAreaSchema.parse({ name: '   ' });
  }, 'VALIDATION_ERROR');

  // 2. Trims input on create
  const area1 = await expectOk('JobArea.create succeeds with trimmed input', async () => {
    const data = createJobAreaSchema.parse({ name: `  ${TAG}AreaA  ` });
    return jobArchitectureService.createJobArea(data);
  });

  // 3. Duplicate (case-insensitive)
  await expectThrow('JobArea.create rejects duplicate name (case-insensitive)', async () => {
    const data = createJobAreaSchema.parse({ name: `${TAG}areaa` });
    return jobArchitectureService.createJobArea(data);
  }, 'AREA_NAME_EXISTS');

  // 4. Update rejects empty name
  await expectThrow('JobArea.update rejects empty name', async () => {
    updateJobAreaSchema.parse({ name: '   ' });
  }, 'VALIDATION_ERROR');

  // 5. Delete blocks when families exist
  const family1 = area1
    ? await expectOk('JobFamily.create succeeds (precondition)', () =>
        jobArchitectureService.createJobFamily(
          createJobFamilySchema.parse({ name: `${TAG}FamilyA`, jobAreaId: area1.id }),
        ),
      )
    : null;
  if (area1) {
    await expectThrow('JobArea.delete blocks when families exist', () =>
      jobArchitectureService.deleteJobArea(area1.id), 'AREA_IN_USE');
  }

  // 6. JobFamily duplicate within same area
  if (area1) {
    await expectThrow('JobFamily.create rejects duplicate (name, jobAreaId)', () =>
      jobArchitectureService.createJobFamily(
        createJobFamilySchema.parse({ name: `${TAG}familya`, jobAreaId: area1.id }),
      ),
      'FAMILY_NAME_EXISTS');
  }

  // 7. JobFamily.create rejects bad UUID
  await expectThrow('JobFamily.create rejects bad UUID jobAreaId', async () => {
    createJobFamilySchema.parse({ name: 'X', jobAreaId: 'not-a-uuid' });
  }, 'VALIDATION_ERROR');

  // 8. JobFamily.update works
  if (family1) {
    await expectOk('JobFamily.update works', () =>
      jobArchitectureService.updateJobFamily(family1.id, { name: `${TAG}FamilyA-renamed` }));
  }

  // ─── Band ─────────────────────────────────────────────────────
  console.log('\n--- Band ---');
  const bandA = await expectOk('Band.create uppercases code', async () => {
    const data = createBandSchema.parse({ code: `${TAG}b1`, label: 'Test B1', level: 901 });
    if (data.code !== `${TAG.toUpperCase()}B1`) throw new Error(`code not uppercased: ${data.code}`);
    return jobArchitectureService.createBand(data);
  });

  await expectThrow('Band.create rejects duplicate code', async () => {
    const data = createBandSchema.parse({ code: `${TAG}B1`, label: 'Dup', level: 902 });
    return jobArchitectureService.createBand(data);
  }, 'BAND_CODE_EXISTS');

  await expectThrow('Band.create rejects duplicate level', async () => {
    const data = createBandSchema.parse({ code: `${TAG}B2`, label: 'Dup level', level: 901 });
    return jobArchitectureService.createBand(data);
  }, 'BAND_LEVEL_EXISTS');

  await expectThrow('Band.update rejects empty label', async () => {
    updateBandSchema.parse({ label: '   ' });
  }, 'VALIDATION_ERROR');

  // Band delete: blocks on jobcodes (we'll set up a jobcode under a separate band)
  const bandB = await expectOk('Band.create second (precondition)', async () =>
    jobArchitectureService.createBand(createBandSchema.parse({
      code: `${TAG}B2`, label: 'Test B2', level: 902,
    })),
  );

  // ─── Grade ────────────────────────────────────────────────────
  console.log('\n--- Grade ---');
  await expectThrow('Grade.create rejects bad bandId', async () => {
    createGradeSchema.parse({ bandId: 'not-a-uuid', gradeCode: 'G1' });
  }, 'VALIDATION_ERROR');

  let grade1: { id: string; bandId: string } | null = null;
  if (bandA) {
    grade1 = await expectOk('Grade.create succeeds', () =>
      jobArchitectureService.createGrade(createGradeSchema.parse({
        bandId: bandA.id, gradeCode: `${TAG}g1`,
      })),
    );
  }
  if (bandA) {
    await expectThrow('Grade.create rejects duplicate (bandId, gradeCode) case-insensitive', () =>
      jobArchitectureService.createGrade(createGradeSchema.parse({
        bandId: bandA.id, gradeCode: `${TAG}G1`,
      })),
      'GRADE_CODE_EXISTS');
  }
  if (grade1) {
    await expectOk('Grade.update works', () =>
      jobArchitectureService.updateGrade(grade1!.id, { description: 'updated' }));
  }

  // Band.delete blocked by Grade
  if (bandA) {
    await expectThrow('Band.delete blocks when Grade references it (Bug 30)', () =>
      jobArchitectureService.deleteBand(bandA.id), 'BAND_IN_USE');
  }

  // ─── JobCode ──────────────────────────────────────────────────
  console.log('\n--- JobCode ---');
  let jobCode1: any = null;
  if (family1 && bandA && grade1) {
    jobCode1 = await expectOk('JobCode.create uppercases code & succeeds with valid grade', async () => {
      const data = createJobCodeSchema.parse({
        code: `${TAG}jc1`, title: 'Test JobCode', jobFamilyId: family1.id, bandId: bandA.id, gradeId: grade1!.id,
      });
      if (!data.code.startsWith(TAG.toUpperCase())) throw new Error('code not uppercased');
      return jobArchitectureService.createJobCode(data);
    });
  }

  if (family1 && bandA) {
    await expectThrow('JobCode.create rejects duplicate code (case-insensitive)', () =>
      jobArchitectureService.createJobCode(createJobCodeSchema.parse({
        code: `${TAG}JC1`, title: 'dup', jobFamilyId: family1.id, bandId: bandA.id,
      })),
      'JOBCODE_CODE_EXISTS');
  }

  // gradeId from a different band
  if (family1 && bandA && bandB && grade1) {
    await expectThrow('JobCode.create rejects gradeId from a different band', () =>
      jobArchitectureService.createJobCode(createJobCodeSchema.parse({
        code: `${TAG}JC2`, title: 'mismatch', jobFamilyId: family1.id, bandId: bandB.id, gradeId: grade1.id,
      })),
      'GRADE_BAND_MISMATCH');
  }

  // JobCode.update preserves gradeId when omitted
  if (jobCode1) {
    const updated = await expectOk('JobCode.update preserves gradeId when omitted', async () => {
      const data = updateJobCodeSchema.parse({ title: 'Renamed Title' });
      return jobArchitectureService.updateJobCode(jobCode1.id, data);
    });
    if (updated && (updated as any).gradeId !== grade1?.id) {
      FAIL('JobCode.update preserves gradeId — value check', `gradeId became ${(updated as any).gradeId} expected ${grade1?.id}`);
    } else if (updated) {
      PASS('JobCode.update preserves gradeId — value check');
    }
  }

  // JobCode.update can clear gradeId with null
  if (jobCode1) {
    const cleared = await expectOk('JobCode.update clears gradeId when null', async () => {
      const data = updateJobCodeSchema.parse({ gradeId: null });
      return jobArchitectureService.updateJobCode(jobCode1.id, data);
    });
    if (cleared && (cleared as any).gradeId !== null) {
      FAIL('JobCode.update gradeId=null clears value', `gradeId is ${(cleared as any).gradeId}`);
    } else if (cleared) {
      PASS('JobCode.update gradeId=null clears value');
    }
  }

  // bandId change with employees assigned — create or reuse an employee attached to jobCode1
  let createdEmpId: string | null = null;
  let prevJobCodeIdForReused: string | null | undefined;
  let reusedEmpId: string | null = null;
  if (jobCode1) {
    const existing = await prisma.employee.findFirst();
    if (existing) {
      prevJobCodeIdForReused = existing.jobCodeId;
      reusedEmpId = existing.id;
      await prisma.employee.update({ where: { id: existing.id }, data: { jobCodeId: jobCode1.id } });
    } else {
      const emp = await prisma.employee.create({
        data: {
          employeeId: `${TAG}EMP1`,
          firstName: 'Test', lastName: 'User',
          email: `${TAG}emp1@example.com`,
          department: 'Test', designation: 'Tester',
          dateOfJoining: new Date(),
          grade: 'G1', band: bandA?.code ?? 'P1',
          gender: 'PREFER_NOT_TO_SAY',
          jobCodeId: jobCode1.id,
        },
      });
      createdEmpId = emp.id;
    }

    if (bandB) {
      await expectThrow('JobCode.update blocks bandId change when employees assigned (Bug 43)', () =>
        jobArchitectureService.updateJobCode(jobCode1.id, { bandId: bandB.id }),
        'JOBCODE_HAS_EMPLOYEES');
    }
    await expectThrow('JobCode.delete blocks when employees assigned (Bug 48)', () =>
      jobArchitectureService.deleteJobCode(jobCode1.id),
      'JOBCODE_IN_USE');

    // Detach
    if (reusedEmpId) {
      await prisma.employee.update({ where: { id: reusedEmpId }, data: { jobCodeId: prevJobCodeIdForReused ?? null } });
    }
    if (createdEmpId) {
      await prisma.employee.delete({ where: { id: createdEmpId } });
    }
  }

  // Grade.delete blocks when JobCode references — we set gradeId=null above, so re-link
  if (jobCode1 && grade1) {
    await prisma.jobCode.update({ where: { id: jobCode1.id }, data: { gradeId: grade1.id } });
    await expectThrow('Grade.delete blocks when JobCode references it', () =>
      jobArchitectureService.deleteGrade(grade1!.id),
      'GRADE_IN_USE');
    await prisma.jobCode.update({ where: { id: jobCode1.id }, data: { gradeId: null } });
  }

  // Now actually delete jobCode1 (no employees attached)
  if (jobCode1) {
    await expectOk('JobCode.delete succeeds when unused', () =>
      jobArchitectureService.deleteJobCode(jobCode1.id));
  }

  // Band.delete still blocked by grade1
  if (bandA && grade1) {
    await expectThrow('Band.delete still blocked by grade after jobcode deletion', () =>
      jobArchitectureService.deleteBand(bandA.id), 'BAND_IN_USE');
  }

  // Delete grade now (no references)
  if (grade1) {
    await expectOk('Grade.delete succeeds when unused', () =>
      jobArchitectureService.deleteGrade(grade1!.id));
  }

  // Band salary-band block (Bug 31)
  if (bandA) {
    // Create a SalaryBand referencing the band
    await prisma.salaryBand.create({
      data: { bandId: bandA.id, effectiveDate: new Date(), minSalary: 1, midSalary: 2, maxSalary: 3 },
    });
    await expectThrow('Band.delete blocks when SalaryBand references it (Bug 31)', () =>
      jobArchitectureService.deleteBand(bandA.id), 'BAND_HAS_SALARY_BANDS');
    // Clean salary band
    await prisma.salaryBand.deleteMany({ where: { bandId: bandA.id } });
  }

  // Now delete bandA — should succeed
  if (bandA) {
    await expectOk('Band.delete succeeds when unused', () =>
      jobArchitectureService.deleteBand(bandA.id));
  }
  if (bandB) {
    await expectOk('Band.delete (B2) succeeds when unused', () =>
      jobArchitectureService.deleteBand(bandB.id));
  }

  // JobFamily.delete blocks check requires a jobcode under it; we already deleted jobCode1.
  // Re-create a jobcode under family1 to test the block, then clean.
  if (family1) {
    const tempBand = await prisma.band.create({ data: { code: `${TAG.toUpperCase()}B3`, label: 't', level: 903 } });
    const tempJc = await prisma.jobCode.create({
      data: { code: `${TAG.toUpperCase()}JC3`, title: 't', jobFamilyId: family1.id, bandId: tempBand.id },
    });
    await expectThrow('JobFamily.delete blocks when JobCodes exist (Bug 18)', () =>
      jobArchitectureService.deleteJobFamily(family1.id), 'FAMILY_IN_USE');
    await prisma.jobCode.delete({ where: { id: tempJc.id } });
    await prisma.band.delete({ where: { id: tempBand.id } });

    await expectOk('JobFamily.delete succeeds when empty', () =>
      jobArchitectureService.deleteJobFamily(family1.id));
  }

  // Now JobArea.delete should succeed
  if (area1) {
    await expectOk('JobArea.delete succeeds when empty', () =>
      jobArchitectureService.deleteJobArea(area1.id));
  }
}

run()
  .catch((e) => {
    console.error('UNCAUGHT:', e);
    failed++;
  })
  .finally(async () => {
    try { await cleanup(); } catch (e) { console.warn('cleanup failed:', e); }
    await prisma.$disconnect();
    console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
    if (failed > 0) {
      console.log('\nFailures:');
      failures.forEach((f) => console.log('  ' + f));
      process.exit(1);
    }
    process.exit(0);
  });
