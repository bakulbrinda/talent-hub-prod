import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { cacheDel } from '../lib/redis';
import { emitBenefitsImportProgress, emitBenefitsImportComplete } from '../lib/socket';
import { BenefitStatus, BenefitCategory } from '@prisma/client';

const VALID_STATUSES: string[] = ['ACTIVE', 'EXPIRED', 'CLAIMED'];

export interface BenefitsImportResult {
  imported: number;
  updated: number;
  errors: { row: number; message: string }[];
}

export const benefitsImportService = {
  parseFile(buffer: Buffer, mimetype: string): Record<string, string>[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
      defval: '',
      raw: false,
    });
    return rows;
  },

  async processImport(
    rows: Record<string, string>[],
    options: { mode?: 'upsert' | 'replace' } = {}
  ): Promise<BenefitsImportResult> {
    const { mode = 'upsert' } = options;
    const errors: { row: number; message: string }[] = [];

    if (mode === 'replace') {
      await prisma.employeeBenefit.deleteMany({});
    }

    // Load all catalog items once — keyed by lowercase name for fast lookup
    const catalog = await prisma.benefitsCatalog.findMany({
      select: { id: true, name: true },
    });
    const catalogMap = new Map(catalog.map(c => [c.name.toLowerCase(), c.id]));

    // Collect all unique benefit names from the CSV upfront
    const uniqueBenefitNames = new Set(
      rows.map(r => (r['Benefit Name'] || '').trim()).filter(Boolean)
    );
    // Auto-create any catalog entry that doesn't exist yet
    for (const name of uniqueBenefitNames) {
      if (!catalogMap.has(name.toLowerCase())) {
        // Infer category from name heuristics (fallback to OTHER)
        const cat = inferCategory(name);
        const created = await prisma.benefitsCatalog.create({
          data: { name, category: cat, isActive: true },
        });
        catalogMap.set(name.toLowerCase(), created.id);
      }
    }

    // Load all employees once — keyed by employeeId string
    const employees = await prisma.employee.findMany({
      select: { id: true, employeeId: true },
    });
    const employeeMap = new Map(employees.map(e => [e.employeeId.toLowerCase(), e.id]));

    // Track which (employeeId, benefitId) pairs already exist
    const existing = await prisma.employeeBenefit.findMany({
      select: { employeeId: true, benefitId: true },
    });
    const existingSet = new Set(existing.map(r => `${r.employeeId}::${r.benefitId}`));

    const toCreate: Parameters<typeof prisma.employeeBenefit.create>[0]['data'][] = [];
    const toUpdate: { employeeId: string; benefitId: string; data: object }[] = [];

    // Track missing IDs with affected row counts — prevents one error per row for the same missing employee
    const missingEmpIds  = new Map<string, number[]>(); // empId → row numbers
    const missingBenefits = new Map<string, number[]>(); // kept for type-safety; always empty after auto-create

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // 1-indexed + header row

      const rawEmpId = (row['Employee ID'] || '').trim();
      const rawBenefitName = (row['Benefit Name'] || '').trim();
      const rawStatus = (row['Status'] || 'ACTIVE').trim().toUpperCase();

      // Required field validation
      if (!rawEmpId) {
        errors.push({ row: rowNum, message: 'Employee ID is required' });
        return;
      }
      if (!rawBenefitName) {
        errors.push({ row: rowNum, message: 'Benefit Name is required' });
        return;
      }
      if (!VALID_STATUSES.includes(rawStatus)) {
        errors.push({ row: rowNum, message: `Invalid Status "${rawStatus}". Must be ACTIVE, EXPIRED, or CLAIMED` });
        return;
      }

      const internalEmpId = employeeMap.get(rawEmpId.toLowerCase());
      if (!internalEmpId) {
        // Collect affected rows; emit one grouped error at the end
        const existing = missingEmpIds.get(rawEmpId) ?? [];
        existing.push(rowNum);
        missingEmpIds.set(rawEmpId, existing);
        return;
      }

      const benefitId = catalogMap.get(rawBenefitName.toLowerCase());
      if (!benefitId) {
        const existing = missingBenefits.get(rawBenefitName) ?? [];
        existing.push(rowNum);
        missingBenefits.set(rawBenefitName, existing);
        return;
      }

      // Parse optional fields
      const utilizationPercent = row['Utilization %'] ? parseFloat(row['Utilization %']) : undefined;
      const rawUtilizedValue = row['Utilized Value (₹)'] || row['Utilized Value (Rs)'] || row['Utilized Value'] || '';
      const utilizedValue = rawUtilizedValue ? parseFloat(rawUtilizedValue) : undefined;

      const rawEnrolledAt = row['Enrolled Date'];
      const rawExpiresAt  = row['Expiry Date'];
      const enrolledAtDate = rawEnrolledAt ? new Date(rawEnrolledAt) : undefined;
      const expiresAtDate  = rawExpiresAt  ? new Date(rawExpiresAt)  : undefined;
      if (enrolledAtDate && isNaN(enrolledAtDate.getTime())) {
        errors.push({ row: rowNum, message: `Row ${rowNum}: Invalid Enrolled Date "${rawEnrolledAt}" — field skipped` });
      }
      if (expiresAtDate && isNaN(expiresAtDate.getTime())) {
        errors.push({ row: rowNum, message: `Row ${rowNum}: Invalid Expiry Date "${rawExpiresAt}" — field skipped` });
      }
      const enrolledAt = enrolledAtDate && !isNaN(enrolledAtDate.getTime()) ? enrolledAtDate : undefined;
      const expiresAt  = expiresAtDate  && !isNaN(expiresAtDate.getTime())  ? expiresAtDate  : undefined;

      const data = {
        status: rawStatus as BenefitStatus,
        ...(utilizationPercent !== undefined && !isNaN(utilizationPercent) && { utilizationPercent }),
        ...(utilizedValue !== undefined && !isNaN(utilizedValue) && { utilizedValue }),
        ...(enrolledAt && { enrolledAt }),
        ...(expiresAt && { expiresAt }),
      };

      const key = `${internalEmpId}::${benefitId}`;
      if (existingSet.has(key)) {
        toUpdate.push({ employeeId: internalEmpId, benefitId, data });
      } else {
        toCreate.push({ employeeId: internalEmpId, benefitId, ...data });
      }
    });

    // Flush grouped "not found" errors — one entry per unique missing employee
    for (const [empId, rows] of missingEmpIds) {
      const firstRow = rows[0];
      const extra = rows.length > 1 ? ` (affects ${rows.length} rows)` : '';
      errors.push({ row: firstRow, message: `Employee ID "${empId}" not found in the system${extra}. Import employees first, then upload benefits.` });
    }
    // missingBenefits is now empty — all unknown benefits are auto-created above

    // Execute DB writes in batches to avoid overwhelming Neon's connection pool.
    // A single transaction with thousands of operations causes connection timeouts.
    const BATCH = 500;
    const writeTotal = toCreate.length + toUpdate.length;
    let writeProcessed = 0;

    emitBenefitsImportProgress({ processed: 0, total: writeTotal });

    if (toCreate.length > 0) {
      for (let i = 0; i < toCreate.length; i += BATCH) {
        await prisma.employeeBenefit.createMany({
          data: toCreate.slice(i, i + BATCH) as any[],
          skipDuplicates: true,
        });
        writeProcessed += Math.min(BATCH, toCreate.length - i);
        emitBenefitsImportProgress({ processed: writeProcessed, total: writeTotal });
      }
    }

    if (toUpdate.length > 0) {
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        await Promise.all(
          toUpdate.slice(i, i + BATCH).map(({ employeeId, benefitId, data }) =>
            prisma.employeeBenefit.update({
              where: { employeeId_benefitId: { employeeId, benefitId } },
              data,
            })
          )
        );
        writeProcessed += Math.min(BATCH, toUpdate.length - i);
        emitBenefitsImportProgress({ processed: writeProcessed, total: writeTotal });
      }
    }

    if (toCreate.length > 0 || toUpdate.length > 0) {
      // Invalidate cached benefits data so the next page load fetches fresh DB values
      await Promise.all([
        cacheDel('benefits:utilization'),
        cacheDel('benefits:enrollments'),
        cacheDel('benefits:ai-analysis'),
      ]);
    }

    emitBenefitsImportComplete({ imported: toCreate.length, updated: toUpdate.length, errors });

    return {
      imported: toCreate.length,
      updated: toUpdate.length,
      errors,
    };
  },

  generateTemplate(): Buffer {
    const headers = [
      'Employee ID',
      'Benefit Name',
      'Status',
      'Utilization %',
      'Utilized Value (₹)',
      'Enrolled Date',
      'Expiry Date',
    ];

    const sampleRows = [
      ['EMP001', 'Comprehensive Medical Insurance', 'ACTIVE', '', '', '2024-04-01', '2025-03-31'],
      ['EMP001', 'RSU Grant', 'ACTIVE', '25', '125000', '2023-07-01', ''],
      ['EMP002', 'Training & Learning Allowance', 'ACTIVE', '60', '12000', '2024-04-01', ''],
      ['EMP002', 'Mental Health on Loop', 'ACTIVE', '', '', '2024-04-01', ''],
    ];

    const wsData = [headers, ...sampleRows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = [
      { wch: 14 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Benefits Import');

    // Add a second sheet listing valid benefit names
    const catalogSheet = XLSX.utils.aoa_to_sheet([
      ['Valid Benefit Names (copy exactly into Benefit Name column)'],
      ['Comprehensive Medical Insurance'],
      ['Parental Medical Insurance'],
      ['Mental Health on Loop'],
      ['RSU Grant'],
      ['Training & Learning Allowance'],
      ['Paternity Leave'],
      ['Bereavement Leave'],
      ['Mochaccino Award'],
      ['TuxedoMocha Award'],
      ['Annual Company Offsite'],
    ]);
    XLSX.utils.book_append_sheet(wb, catalogSheet, 'Valid Benefit Names');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  },
};

// ── Helper: infer BenefitCategory from benefit name keywords ─────────────────
function inferCategory(name: string): BenefitCategory {
  const n = name.toLowerCase();
  if (/rsu|equity|stock|esop|grant|vesting/.test(n))                                  return BenefitCategory.EQUITY;
  if (/leave|paternity|maternity|bereavement|vacation|holiday/.test(n))               return BenefitCategory.LEAVE;
  if (/learn|training|course|certification|education|tuition/.test(n))                return BenefitCategory.LEARNING;
  if (/wellness|gym|fitness|mental|therapy|yoga|sport/.test(n))                       return BenefitCategory.WELLNESS;
  if (/award|recognition|bonus|incentive|reward/.test(n))                             return BenefitCategory.RECOGNITION;
  // health/medical/dental/vision/pf/nps/meal/allowance → INSURANCE (closest available category)
  return BenefitCategory.INSURANCE;
}
