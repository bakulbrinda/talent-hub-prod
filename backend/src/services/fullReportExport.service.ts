import * as XLSX from 'xlsx';
import { prisma } from '../lib/prisma';
import { callClaude } from '../lib/claudeClient';

export interface ReportData {
  employees: Awaited<ReturnType<typeof prisma.employee.findMany>>;
  benefits: Awaited<ReturnType<typeof fetchBenefits>>;
}

async function fetchBenefits() {
  return prisma.employeeBenefit.findMany({
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeId: true,
          department: true,
        },
      },
      benefit: {
        select: {
          name: true,
          category: true,
        },
      },
    },
    orderBy: {
      employee: {
        lastName: 'asc',
      },
    },
  });
}

export async function fetchReportData(): Promise<ReportData> {
  const [employees, benefits] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [
        { department: 'asc' },
        { lastName: 'asc' },
      ],
    }),
    fetchBenefits(),
  ]);

  return { employees, benefits };
}
