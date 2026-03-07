import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { BenefitStatus } from '@prisma/client';

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

  async processImport(rows: Record<string, string>[]): Promise<BenefitsImportResult> {
    const errors: { row: number; message: string }[] = [];

    // Load all catalog items once — keyed by lowercase name for fast lookup
    const catalog = await prisma.benefitsCatalog.findMany({
      select: { id: true, name: true },
    });
    const catalogMap = new Map(catalog.map(c => [c.name.toLowerCase(), c.id]));

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
        errors.push({ row: rowNum, message: `Employee ID "${rawEmpId}" not found` });
        return;
      }

      const benefitId = catalogMap.get(rawBenefitName.toLowerCase());
      if (!benefitId) {
        errors.push({ row: rowNum, message: `Benefit "${rawBenefitName}" not found in catalog` });
        return;
      }

      // Parse optional fields
      const utilizationPercent = row['Utilization %'] ? parseFloat(row['Utilization %']) : undefined;
      const utilizedValue = row['Utilized Value (₹)'] ? parseFloat(row['Utilized Value (₹)']) : undefined;
      const enrolledAt = row['Enrolled Date'] ? new Date(row['Enrolled Date']) : undefined;
      const expiresAt = row['Expiry Date'] ? new Date(row['Expiry Date']) : undefined;

      const data = {
        status: rawStatus as BenefitStatus,
        ...(utilizationPercent !== undefined && !isNaN(utilizationPercent) && { utilizationPercent }),
        ...(utilizedValue !== undefined && !isNaN(utilizedValue) && { utilizedValue }),
        ...(enrolledAt && !isNaN(enrolledAt.getTime()) && { enrolledAt }),
        ...(expiresAt && !isNaN(expiresAt.getTime()) && { expiresAt }),
      };

      const key = `${internalEmpId}::${benefitId}`;
      if (existingSet.has(key)) {
        toUpdate.push({ employeeId: internalEmpId, benefitId, data });
      } else {
        toCreate.push({ employeeId: internalEmpId, benefitId, ...data });
      }
    });

    // Execute all DB writes in a transaction
    if (toCreate.length > 0 || toUpdate.length > 0) {
      await prisma.$transaction([
        ...toCreate.map(data => prisma.employeeBenefit.create({ data: data as any })),
        ...toUpdate.map(({ employeeId, benefitId, data }) =>
          prisma.employeeBenefit.update({
            where: { employeeId_benefitId: { employeeId, benefitId } },
            data,
          })
        ),
      ]);
    }

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
