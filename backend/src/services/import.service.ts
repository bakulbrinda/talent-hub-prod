import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { Gender, WorkMode, EmploymentType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { employeeService } from './employee.service';
import { emitEmployeeImportProgress, emitEmployeeImportComplete } from '../lib/socket';
import { cacheDel, cacheDelPattern } from '../lib/redis';
import logger from '../lib/logger';

export interface ImportRow {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  gender: string;
  band: string;
  grade: string;
  annualFixed: string;
  variablePay?: string;
  annualCtc?: string;
  workMode?: string;
  workLocation?: string;
  employmentType?: string;
  reportingManagerEmail?: string;
  costCenter?: string;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: ImportError[];
  replaced?: boolean;
  detectedColumns?: string[];
}

// ─── Column Alias Map ─────────────────────────────────────────
// Strips spaces/underscores/hyphens, lowercases, then maps to canonical field
const COLUMN_ALIASES: Record<string, keyof ImportRow | 'fullName'> = {
  // employeeId
  employeeid: 'employeeId', empid: 'employeeId', empno: 'employeeId',
  employeeno: 'employeeId', employeenumber: 'employeeId', staffid: 'employeeId',
  staffno: 'employeeId', refno: 'employeeId', associateid: 'employeeId',
  workerid: 'employeeId', id: 'employeeId', employeeidentifier: 'employeeId',

  // name (combined – split later)
  name: 'fullName', fullname: 'fullName', employeename: 'fullName',
  staffname: 'fullName', associatename: 'fullName', workername: 'fullName',
  candidatename: 'fullName', membername: 'fullName',

  // firstName
  firstname: 'firstName', fname: 'firstName', givenname: 'firstName', forename: 'firstName',

  // lastName
  lastname: 'lastName', lname: 'lastName', surname: 'lastName', familyname: 'lastName',

  // email
  email: 'email', emailaddress: 'email', workmail: 'email', officeemail: 'email',
  corporateemail: 'email', officialmail: 'email', companye_mail: 'email',

  // department
  department: 'department', dept: 'department', businessunit: 'department',
  bu: 'department', division: 'department', team: 'department',
  function: 'department', practicearea: 'department', costdepartment: 'department',

  // designation
  designation: 'designation', jobtitle: 'designation', title: 'designation',
  role: 'designation', position: 'designation', jobrole: 'designation',
  currentdesignation: 'designation', jobdesignation: 'designation',
  currentrole: 'designation', jobposition: 'designation',

  // dateOfJoining
  dateofjoining: 'dateOfJoining', doj: 'dateOfJoining', joiningdate: 'dateOfJoining',
  startdate: 'dateOfJoining', hiredate: 'dateOfJoining', dateofhire: 'dateOfJoining',
  doh: 'dateOfJoining', dateofjoin: 'dateOfJoining', joiningdateddmmyyyy: 'dateOfJoining',
  dateofcommencement: 'dateOfJoining',

  // gender
  gender: 'gender', sex: 'gender',

  // band
  band: 'band', payband: 'band', level: 'band', gradelevel: 'band',
  bandlevel: 'band', salarylevel: 'band', joblevel: 'band', careerband: 'band',
  employeeband: 'band', salarband: 'band',

  // grade
  grade: 'grade', paygrade: 'grade', subband: 'grade', jobgrade: 'grade',
  gradecode: 'grade', employeegrade: 'grade',

  // annualFixed
  annualfixed: 'annualFixed', fixedctc: 'annualFixed', basesalary: 'annualFixed',
  annualbase: 'annualFixed', fixedsalary: 'annualFixed', annualfixedsalary: 'annualFixed',
  fixedannual: 'annualFixed', basectc: 'annualFixed', fixedpay: 'annualFixed',
  annualsalary: 'annualFixed', totalfixed: 'annualFixed', annualfixedctc: 'annualFixed',
  grosssalary: 'annualFixed', annualgross: 'annualFixed', fixedcomponent: 'annualFixed',

  // variablePay
  variablepay: 'variablePay', variable: 'variablePay', targetvariable: 'variablePay',
  variablecompensation: 'variablePay', bonustarget: 'variablePay',
  annualvariable: 'variablePay', variablectc: 'variablePay', incentive: 'variablePay',
  annualincentive: 'variablePay', stincentive: 'variablePay', bonus: 'variablePay',

  // annualCtc (ALSO used as annualFixed fallback when annualFixed absent)
  annualctc: 'annualCtc', ctc: 'annualCtc', totalctc: 'annualCtc',
  totalcompensation: 'annualCtc', grossctc: 'annualCtc', totalannualctc: 'annualCtc',
  packagectc: 'annualCtc', totalpackage: 'annualCtc', overallctc: 'annualCtc',
  grossannualctc: 'annualCtc', annualtotalctc: 'annualCtc', compensation: 'annualCtc',

  // workMode
  workmode: 'workMode', workingmode: 'workMode', workarrangement: 'workMode',
  workingarrangement: 'workMode', mode: 'workMode',

  // workLocation
  worklocation: 'workLocation', location: 'workLocation', officelocation: 'workLocation',
  city: 'workLocation', baselocation: 'workLocation', primarylocation: 'workLocation',
  office: 'workLocation', site: 'workLocation', basecity: 'workLocation',

  // employmentType
  employmenttype: 'employmentType', emptype: 'employmentType', contracttype: 'employmentType',
  employeetype: 'employmentType', workertype: 'employmentType', stafftype: 'employmentType',

  // reportingManagerEmail
  reportingmanageremail: 'reportingManagerEmail', manageremail: 'reportingManagerEmail',
  reportstoemail: 'reportingManagerEmail', reportingmanager: 'reportingManagerEmail',
  managersmail: 'reportingManagerEmail', reportsto: 'reportingManagerEmail',

  // costCenter
  costcenter: 'costCenter', cc: 'costCenter', costcentre: 'costCenter',
  costcentrecode: 'costCenter', costcentercode: 'costCenter',
};

function normKey(raw: string): string {
  return String(raw).toLowerCase().replace(/[\s_\-\.\/\\]/g, '').trim();
}

function normaliseHeaders(rows: Record<string, any>[]): { rows: ImportRow[]; detected: string[] } {
  const detected = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapped = rows.map((row) => {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      const canonical = COLUMN_ALIASES[normKey(key)];
      if (canonical === 'fullName') {
        // split "Priya Sharma" → firstName + lastName
        const parts = String(val || '').trim().split(/\s+/);
        if (!out['firstName']) out['firstName'] = parts[0] || '';
        if (!out['lastName']) out['lastName'] = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
      } else if (canonical) {
        out[canonical] = val;
      } else {
        out[key] = val; // keep unknown columns too
      }
    }
    return out as ImportRow;
  });
  return { rows: mapped, detected };
}

// ─── Value Normalisers ────────────────────────────────────────
const GENDER_MAP: Record<string, string> = {
  m: 'MALE', male: 'MALE', man: 'MALE',
  f: 'FEMALE', female: 'FEMALE', woman: 'FEMALE',
  nb: 'NON_BINARY', nonbinary: 'NON_BINARY',
  other: 'PREFER_NOT_TO_SAY', prefernotsay: 'PREFER_NOT_TO_SAY', na: 'PREFER_NOT_TO_SAY',
};

const WORKMODE_MAP: Record<string, string> = {
  remote: 'REMOTE', wfh: 'REMOTE', workfromhome: 'REMOTE', home: 'REMOTE', wf: 'REMOTE',
  onsite: 'ONSITE', office: 'ONSITE', wfo: 'ONSITE', inoffice: 'ONSITE',
  hybrid: 'HYBRID', mixed: 'HYBRID', partial: 'HYBRID',
};

const EMPTYPE_MAP: Record<string, string> = {
  fulltime: 'FULL_TIME', ft: 'FULL_TIME', permanent: 'FULL_TIME', regular: 'FULL_TIME',
  parttime: 'PART_TIME', pt: 'PART_TIME',
  contract: 'CONTRACT', contractor: 'CONTRACT', consultant: 'CONTRACT', temp: 'CONTRACT', temporary: 'CONTRACT',
  intern: 'INTERN', internship: 'INTERN', trainee: 'INTERN', apprentice: 'INTERN',
};

const VALID_BANDS = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
const VALID_GENDERS = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'];

// Parse salary strings like "12,00,000" / "12.5L" / "12.5 Lakhs" / "1200000"
function parseSalary(val: any): number {
  if (!val) return 0;
  const str = String(val).replace(/[\s,]/g, '').toLowerCase();
  const lakh = str.match(/^([\d.]+)\s*l(?:akh)?s?$/i);
  if (lakh) return parseFloat(lakh[1]) * 100000;
  const k = str.match(/^([\d.]+)k$/i);
  if (k) return parseFloat(k[1]) * 1000;
  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

// Parse any date format → YYYY-MM-DD
function parseDate(val: any): string {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel date serial
    try {
      const info = XLSX.SSF.parse_date_code(val);
      if (info) return `${info.y}-${String(info.m).padStart(2,'0')}-${String(info.d).padStart(2,'0')}`;
    } catch {}
  }
  const str = String(val).trim();
  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    // if first part > 12 it's definitely day
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  const ymd = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return str;
}

function normaliseValues(row: ImportRow): ImportRow {
  const r = { ...row };
  if (r.gender) r.gender = GENDER_MAP[normKey(r.gender)] || r.gender.toUpperCase();
  if (r.workMode) r.workMode = WORKMODE_MAP[normKey(r.workMode)] || r.workMode.toUpperCase();
  if (r.employmentType) r.employmentType = EMPTYPE_MAP[normKey(r.employmentType)] || r.employmentType.toUpperCase();
  if (r.band) r.band = r.band.toString().toUpperCase().trim();
  if (r.dateOfJoining) r.dateOfJoining = parseDate(r.dateOfJoining);
  if (r.annualFixed) r.annualFixed = String(parseSalary(r.annualFixed) || r.annualFixed);
  if (r.variablePay) r.variablePay = String(parseSalary(r.variablePay) || r.variablePay);
  if (r.annualCtc) r.annualCtc = String(parseSalary(r.annualCtc) || r.annualCtc);
  return r;
}

// ─── Auto-Repair: fill in missing required fields ─────────────
// Only truly give up if there's no name AND no salary at all.
let _autoIdCounter = 1;

function autoRepairRow(row: ImportRow, rowIndex: number): ImportRow {
  const r = { ...row } as any;

  // 1. Name — try to infer firstName/lastName from any remaining unknown column
  if (!r.firstName || !r.lastName) {
    // scan raw (non-canonical) keys for something that looks like a name
    for (const [k, v] of Object.entries(r)) {
      if (['employeeId','email','department','designation','band','grade','annualFixed',
           'variablePay','annualCtc','workMode','workLocation','employmentType',
           'reportingManagerEmail','costCenter','dateOfJoining','gender'].includes(k)) continue;
      if (typeof v === 'string' && v.trim() && /^[a-zA-Z\s]+$/.test(v.trim())) {
        const parts = v.trim().split(/\s+/);
        if (!r.firstName) r.firstName = parts[0];
        if (!r.lastName) r.lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
        break;
      }
    }
  }
  if (!r.firstName) r.firstName = `Employee`;
  if (!r.lastName) r.lastName = String(rowIndex + 1);

  // 2. employeeId — auto-generate
  if (!r.employeeId || !String(r.employeeId).trim()) {
    const prefix = (r.firstName || 'EMP').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'E');
    r.employeeId = `EMP-${prefix}-${String(_autoIdCounter++).padStart(4, '0')}`;
  }

  // 3. email — auto-generate
  if (!r.email || !String(r.email).trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
    const fn = (r.firstName || 'emp').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ln = (r.lastName || String(rowIndex)).toLowerCase().replace(/[^a-z0-9]/g, '');
    r.email = `${fn}.${ln}@company.com`;
  }

  // 4. annualFixed — fall back to annualCtc then variablePay, then 500000
  if (!r.annualFixed || parseSalary(r.annualFixed) <= 0) {
    if (r.annualCtc && parseSalary(r.annualCtc) > 0) {
      r.annualFixed = r.annualCtc;
    } else if (r.variablePay && parseSalary(r.variablePay) > 0) {
      r.annualFixed = r.variablePay;
    } else {
      r.annualFixed = '500000'; // ₹5L default
    }
  }

  // 5. department — default to 'General'
  if (!r.department || !String(r.department).trim()) r.department = 'General';

  // 6. designation — default to 'Employee'
  if (!r.designation || !String(r.designation).trim()) r.designation = 'Employee';

  // 7. gender — default PREFER_NOT_TO_SAY
  if (!r.gender || !VALID_GENDERS.includes(String(r.gender).toUpperCase())) {
    r.gender = 'PREFER_NOT_TO_SAY';
  }

  // 8. band — default A1, try to infer from designation/level
  if (!r.band || !VALID_BANDS.includes(String(r.band).toUpperCase())) {
    const des = String(r.designation || '').toLowerCase();
    if (des.includes('chief') || des.includes('cxo') || des.includes('vp') || des.includes('vice president')) r.band = 'D2';
    else if (des.includes('director')) r.band = 'D1';
    else if (des.includes('senior director')) r.band = 'D2';
    else if (des.includes('senior manager') || des.includes('sr manager')) r.band = 'M2';
    else if (des.includes('manager')) r.band = 'M1';
    else if (des.includes('lead') || des.includes('principal')) r.band = 'P3';
    else if (des.includes('p3') || des.includes('staff')) r.band = 'P3';
    else if (des.includes('manager') || des.includes('lead') || des.includes('principal')) r.band = 'P2';
    else if (des.includes('senior') || des.includes('sr.') || des.includes('specialist')) r.band = 'P1';
    else if (des.includes('associate') || des.includes('junior') || des.includes('jr.')) r.band = 'A2';
    else r.band = 'A1';
  }

  // 9. grade — default to band code
  if (!r.grade || !String(r.grade).trim()) r.grade = r.band || 'L1';

  // 10. dateOfJoining — default to 2 years ago
  if (!r.dateOfJoining || isNaN(Date.parse(r.dateOfJoining))) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    r.dateOfJoining = twoYearsAgo.toISOString().split('T')[0];
  }

  return r as ImportRow;
}

export const importService = {
  parseFile: (buffer: Buffer, mimetype: string): { rows: ImportRow[]; detectedColumns: string[] } => {
    try {
      let rawRows: Record<string, any>[];

      if (mimetype === 'text/csv' || mimetype === 'application/csv' || mimetype === 'text/plain') {
        rawRows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, any>[];
      } else {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
        // Try to find the sheet with the most data
        let bestSheet = workbook.SheetNames[0];
        let bestCount = 0;
        for (const name of workbook.SheetNames) {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: '' });
          if (rows.length > bestCount) { bestCount = rows.length; bestSheet = name; }
        }
        rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[bestSheet], { defval: '' });
      }

      // Skip completely empty rows
      rawRows = rawRows.filter(r => Object.values(r).some(v => String(v).trim() !== ''));

      const { rows: normalised, detected } = normaliseHeaders(rawRows);
      const valued = normalised.map(normaliseValues);
      return { rows: valued, detectedColumns: detected };
    } catch (err) {
      logger.error('Failed to parse import file:', err);
      throw new Error('Invalid file format. Please upload a valid CSV or Excel file.');
    }
  },

  buildEmployeeData: async (row: ImportRow) => {
    const annualFixed = parseSalary(row.annualFixed);
    const basic = annualFixed * 0.35;
    const hra = annualFixed * 0.20;
    const lta = annualFixed * 0.05;
    const pf = basic * 0.12;
    const specialAllowance = annualFixed - basic - hra - lta;
    const variablePay = row.variablePay ? parseSalary(row.variablePay) : annualFixed * 0.10;
    const annualCtc = row.annualCtc ? parseSalary(row.annualCtc) : annualFixed + variablePay + pf;

    let reportingManagerId: string | null = null;
    if (row.reportingManagerEmail?.trim()) {
      const manager = await prisma.employee.findFirst({
        where: { email: row.reportingManagerEmail.trim().toLowerCase(), employmentStatus: 'ACTIVE' },
        select: { id: true },
      });
      reportingManagerId = manager?.id ?? null;
    }

    const base = {
      employeeId: String(row.employeeId).trim(),
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      email: row.email.trim().toLowerCase(),
      department: row.department.trim(),
      designation: row.designation.trim(),
      dateOfJoining: new Date(row.dateOfJoining.trim()),
      gender: row.gender.trim().toUpperCase() as Gender,
      band: row.band.trim().toUpperCase(),
      grade: row.grade.trim(),
      annualFixed,
      variablePay,
      annualCtc,
      basicAnnual: basic,
      basicMonthly: basic / 12,
      hra,
      hraMonthly: hra / 12,
      lta,
      ltaMonthly: lta / 12,
      pfYearly: pf,
      pfMonthly: pf / 12,
      specialAllowance,
      monthlySpecialAllowance: specialAllowance / 12,
      flexiTotalYearly: 0,
      flexiTotalMonthly: 0,
      subTotalA: annualFixed,
      subTotalAMonthly: annualFixed / 12,
      monthlyGrossSalary: annualFixed / 12,
      incentives: 0,
      joiningBonus: 0,
      retentionBonus: 0,
      workMode: (row.workMode?.trim().toUpperCase() || 'HYBRID') as WorkMode,
      workLocation: row.workLocation?.trim() || null,
      employmentType: (row.employmentType?.trim().toUpperCase() || 'FULL_TIME') as EmploymentType,
      employmentStatus: 'ACTIVE' as const,
      costCenter: row.costCenter?.trim() || null,
    };

    if (reportingManagerId) {
      return { ...base, reportingManager: { connect: { id: reportingManagerId } } };
    }
    return base;
  },

  autoEnrollBenefits: async (employeeIds: string[]): Promise<void> => {
    try {
      if (employeeIds.length === 0) return;
      const [benefits, employees] = await Promise.all([
        prisma.benefitsCatalog.findMany({ where: { isActive: true } }),
        prisma.employee.findMany({
          where: { id: { in: employeeIds } },
          select: { id: true, gender: true, employmentType: true, employmentStatus: true, band: true, dateOfJoining: true },
        }),
      ]);

      const BAND_ORDER = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
      const now = new Date();

      for (const emp of employees) {
        const tenureMonths = Math.floor((now.getTime() - new Date(emp.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30));
        const bandIndex = BAND_ORDER.indexOf(emp.band);

        for (const benefit of benefits) {
          const criteria = benefit.eligibilityCriteria as any;
          // Skip performance-based benefits — no perf data yet after import
          if (criteria?.minPerformanceRating !== undefined) continue;
          if (criteria?.employmentTypes && !criteria.employmentTypes.includes(emp.employmentType)) continue;
          if (criteria?.genders && !criteria.genders.includes(emp.gender)) continue;
          if (criteria?.employmentStatuses && !criteria.employmentStatuses.includes(emp.employmentStatus)) continue;
          if (criteria?.minBandLevel !== undefined && bandIndex < criteria.minBandLevel) continue;
          if (criteria?.minTenureMonths !== undefined && tenureMonths < criteria.minTenureMonths) continue;

          await prisma.employeeBenefit.upsert({
            where: { employeeId_benefitId: { employeeId: emp.id, benefitId: benefit.id } },
            update: {},
            create: { employeeId: emp.id, benefitId: benefit.id, enrolledAt: now, status: 'ACTIVE', utilizationPercent: 0, utilizedValue: 0 },
          });
        }
      }
      logger.info(`Auto-enrolled benefits for ${employees.length} imported employees`);
    } catch (err) {
      logger.warn('Benefits auto-enrollment error (non-fatal):', err);
    }
  },

  invalidateAllCaches: async () => {
    try {
      // Wipe every module cache that derives its data from the employee table.
      // Promise.allSettled ensures one failing Redis key never blocks the rest.
      await Promise.allSettled([
        cacheDelPattern('dashboard:*'),
        cacheDelPattern('pay-equity:*'),
        cacheDelPattern('salary-bands:*'),
        cacheDelPattern('performance:*'),
        cacheDel('ai:dashboard-summary'),
        cacheDel('benefits:catalog'),
        cacheDel('benefits:utilization'),
      ]);
      // Expire all cached AI insights so they regenerate with fresh employee data.
      await prisma.aiInsight.updateMany({ data: { expiresAt: new Date() } });
      logger.info('All module caches invalidated after employee import');
    } catch (err) {
      logger.warn('Cache invalidation error (non-fatal):', err);
    }
  },

  processImport: async (
    rows: ImportRow[],
    options: { mode?: 'replace' | 'upsert'; detectedColumns?: string[] } = {}
  ): Promise<ImportResult> => {
    const { mode = 'upsert', detectedColumns = [] } = options;

    if (mode === 'replace') {
      logger.info('Replace mode: clearing all existing employees');
      await prisma.employee.deleteMany();
    }

    _autoIdCounter = 1; // reset counter for this import batch
    const allErrors: ImportError[] = [];
    const importedIds: string[] = [];
    let imported = 0;
    let failed = 0;
    const total = rows.length;
    const BATCH_SIZE = 10;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (let j = 0; j < batch.length; j++) {
        const rawRow = batch[j];
        const rowIndex = i + j;

        // Check if row has ANY usable content — skip completely blank rows
        const hasName = rawRow.firstName?.trim() || rawRow.lastName?.trim();
        const hasSalary = parseSalary(rawRow.annualFixed) > 0
          || parseSalary(rawRow.annualCtc) > 0
          || parseSalary(rawRow.variablePay) > 0;

        if (!hasName && !hasSalary) {
          // Truly empty row — skip silently
          continue;
        }

        // Auto-repair missing fields
        const row = autoRepairRow(rawRow, rowIndex);

        try {
          const data = await importService.buildEmployeeData(row);
          const employee = await prisma.employee.upsert({
            where: { employeeId: data.employeeId },
            update: { ...data },
            create: { ...data },
          });
          await employeeService.computeAndUpdateDerivedFields(employee.id);
          importedIds.push(employee.id);
          imported++;
        } catch (err: any) {
          const msg = err?.message?.includes('Unique constraint')
            ? `Duplicate email: ${row.email}`
            : (err?.message || 'Database error');
          allErrors.push({ row: rowIndex + 2, field: 'general', message: msg });
          failed++;
          logger.warn(`Row ${rowIndex + 2} failed: ${msg}`);
        }

        if ((j + 1) % BATCH_SIZE === 0 || j === batch.length - 1) {
          emitEmployeeImportProgress({ processed: i + j + 1, total, errors: allErrors });
        }
      }
    }

    // Auto-enroll employees in eligible benefits
    await importService.autoEnrollBenefits(importedIds);

    await importService.invalidateAllCaches();

    const result: ImportResult = { imported, failed, errors: allErrors, replaced: mode === 'replace', detectedColumns };
    emitEmployeeImportComplete(result);
    return result;
  },

  generateTemplate: (): string => {
    const headers = [
      'employeeId', 'firstName', 'lastName', 'email',
      'department', 'designation', 'dateOfJoining', 'gender',
      'band', 'grade', 'annualFixed', 'variablePay', 'annualCtc',
      'workMode', 'workLocation', 'employmentType', 'reportingManagerEmail', 'costCenter',
    ];
    const r1 = ['EMP001','Priya','Sharma','priya.sharma@company.com','Engineering','Software Engineer','2024-01-15','FEMALE','P1','P1-L1','1200000','120000','1380000','HYBRID','Bangalore','FULL_TIME','manager@company.com','CC-ENG'];
    const r2 = ['EMP002','Rahul','Verma','rahul.verma@company.com','Sales','Account Executive','2023-06-01','MALE','A2','A2-L1','800000','200000','1050000','ONSITE','Mumbai','FULL_TIME','',''];
    return [headers.join(','), r1.join(','), r2.join(',')].join('\n');
  },
};
