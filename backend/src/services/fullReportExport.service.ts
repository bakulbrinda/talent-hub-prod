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

export function computeStats(employees: any[], benefits: any[]) {
  const total = employees.length;
  const active = employees.filter(e => e.employmentStatus === 'ACTIVE').length;

  // Band distribution
  const byBand: Record<string, number> = {};
  employees.forEach(e => { byBand[e.band] = (byBand[e.band] || 0) + 1; });

  // Department headcount
  const byDept: Record<string, number> = {};
  employees.forEach(e => { byDept[e.department] = (byDept[e.department] || 0) + 1; });

  // Gender split
  const byGender: Record<string, number> = {};
  employees.forEach(e => { byGender[e.gender] = (byGender[e.gender] || 0) + 1; });

  // Work mode split
  const byMode: Record<string, number> = {};
  employees.forEach(e => { byMode[e.workMode] = (byMode[e.workMode] || 0) + 1; });

  // Compensation
  const withCompa = employees.filter(e => e.compaRatio !== null);
  const avgCompa = withCompa.length
    ? withCompa.reduce((s, e) => s + Number(e.compaRatio), 0) / withCompa.length
    : 0;
  const outliers = employees.filter(e => e.compaRatio !== null && (Number(e.compaRatio) < 80 || Number(e.compaRatio) > 120)).length;
  const totalCtcCr = employees.reduce((s, e) => s + Number(e.annualCtc), 0) / 1e7;
  const withVariable = employees.filter(e => Number(e.variablePay) > 0).length;

  // Gender pay gap (male vs female avg fixed, active only)
  const maleFixed   = employees.filter(e => e.gender === 'MALE'   && e.employmentStatus === 'ACTIVE').map(e => Number(e.annualFixed));
  const femaleFixed = employees.filter(e => e.gender === 'FEMALE' && e.employmentStatus === 'ACTIVE').map(e => Number(e.annualFixed));
  const maleAvg     = maleFixed.length   ? maleFixed.reduce((s, v) => s + v, 0)   / maleFixed.length   : 0;
  const femaleAvg   = femaleFixed.length ? femaleFixed.reduce((s, v) => s + v, 0) / femaleFixed.length : 0;
  const genderGapPct = maleAvg > 0 ? ((maleAvg - femaleAvg) / maleAvg * 100) : 0;

  // Benefits
  const totalEnrollments = benefits.length;
  const activeEnrollments = benefits.filter(b => b.status === 'ACTIVE').length;
  const expiredEnrollments = benefits.filter(b => b.status === 'EXPIRED').length;
  const claimedEnrollments = benefits.filter(b => b.status === 'CLAIMED').length;
  const withUtil = benefits.filter(b => b.utilizationPercent !== null);
  const avgUtil = withUtil.length
    ? withUtil.reduce((s, b) => s + Number(b.utilizationPercent), 0) / withUtil.length
    : 0;
  const rsuEnrollments = benefits.filter(b => b.benefit.name.includes('RSU'));
  const avgRsuVest = rsuEnrollments.filter(b => b.utilizationPercent !== null).length
    ? rsuEnrollments.filter(b => b.utilizationPercent !== null)
        .reduce((s, b) => s + Number(b.utilizationPercent), 0) /
      rsuEnrollments.filter(b => b.utilizationPercent !== null).length
    : 0;

  // Upcoming RSU vesting in 30 days
  const today = new Date();
  const in30 = new Date(today.getTime() + 30 * 86400000);
  const upcomingVesting = rsuEnrollments.filter(b => {
    if (!b.expiresAt) return false;
    const d = new Date(b.expiresAt);
    return d >= today && d <= in30;
  }).length;

  return {
    people: { total, active, byBand, byDept, byGender, byMode },
    compensation: { avgCompa, outliers, totalCtcCr, withVariable, total, genderGapPct, maleAvg, femaleAvg },
    benefits: { totalEnrollments, activeEnrollments, expiredEnrollments, claimedEnrollments, avgUtil, avgRsuVest, upcomingVesting },
  };
}
