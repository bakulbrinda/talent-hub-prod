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

// ─── Task 3: AI bullet points ────────────────────────────────
export async function generateAiSummary(stats: ReturnType<typeof computeStats>): Promise<{
  people: string[];
  compensation: string[];
  benefits: string[];
}> {
  const { people, compensation, benefits } = stats;

  const prompt = `You are an HR analytics AI. Based on the stats below, return ONLY a JSON object (no markdown, no explanation) with exactly this shape:
{
  "people": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "compensation": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "benefits": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"]
}

Each array has exactly 5 concise bullet points (1-2 sentences each). Use specific numbers from the data.

PEOPLE STATS:
- Total employees: ${people.total} (${people.active} active)
- Band distribution: ${JSON.stringify(people.byBand)}
- Department headcount: ${JSON.stringify(people.byDept)}
- Gender split: ${JSON.stringify(people.byGender)}
- Work mode: ${JSON.stringify(people.byMode)}

COMPENSATION STATS:
- Total annual CTC: ₹${compensation.totalCtcCr.toFixed(1)} Cr
- Average compa-ratio: ${compensation.avgCompa.toFixed(1)}%
- Employees outside band (CR <80% or >120%): ${compensation.outliers} (${((compensation.outliers / compensation.total) * 100).toFixed(1)}%)
- Employees with variable pay: ${compensation.withVariable} (${((compensation.withVariable / compensation.total) * 100).toFixed(0)}%)
- Gender pay gap (M vs F avg fixed): ${compensation.genderGapPct.toFixed(1)}% (M: ₹${(compensation.maleAvg / 100000).toFixed(1)}L, F: ₹${(compensation.femaleAvg / 100000).toFixed(1)}L)

BENEFITS STATS:
- Total enrollments: ${benefits.totalEnrollments} (Active: ${benefits.activeEnrollments}, Expired: ${benefits.expiredEnrollments}, Claimed: ${benefits.claimedEnrollments})
- Average benefit utilization: ${benefits.avgUtil.toFixed(1)}%
- Average RSU vesting: ${benefits.avgRsuVest.toFixed(1)}%
- RSU grants vesting in next 30 days: ${benefits.upcomingVesting}`;

  const response = await callClaude(prompt, { maxTokens: 800, temperature: 0.2 });

  try {
    const clean = response.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      people:       (parsed.people       || []).slice(0, 5),
      compensation: (parsed.compensation || []).slice(0, 5),
      benefits:     (parsed.benefits     || []).slice(0, 5),
    };
  } catch {
    return {
      people:       ['AI analysis unavailable — check API key.'],
      compensation: ['AI analysis unavailable — check API key.'],
      benefits:     ['AI analysis unavailable — check API key.'],
    };
  }
}

// ─── Task 4: xlsx workbook assembly ─────────────────────────
function fmt(n: any): number { return Number(n || 0); }
function fmtDate(d: any): string { return d ? new Date(d).toLocaleDateString('en-IN') : ''; }

export function buildWorkbook(
  employees: any[],
  benefits: any[],
  aiSummary: { people: string[]; compensation: string[]; benefits: string[] },
  exportDate: string
) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: AI Summary ──────────────────────────────────────
  const summaryRows: any[][] = [
    ['Talent Hub — Full Report Export'],
    [`Generated: ${exportDate}`],
    [],
    ['PEOPLE OVERVIEW'],
    ...aiSummary.people.map((b, i) => [`${i + 1}.`, b]),
    [],
    ['COMPENSATION OVERVIEW'],
    ...aiSummary.compensation.map((b, i) => [`${i + 1}.`, b]),
    [],
    ['BENEFITS OVERVIEW'],
    ...aiSummary.benefits.map((b, i) => [`${i + 1}.`, b]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 4 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'AI Summary');

  // ── Sheet 2: Employees (all fields, all statuses) ────────────
  const empHeaders = [
    'Employee ID', 'First Name', 'Last Name', 'Email', 'Department', 'Designation',
    'Band', 'Grade', 'Employment Type', 'Employment Status', 'Gender',
    'Work Mode', 'Work Location', 'Date of Joining', 'Date of Exit',
    'Annual Fixed (₹)', 'Variable Pay (₹)', 'Annual CTC (₹)',
    'Basic Annual (₹)', 'HRA Annual (₹)', 'PF Yearly (₹)',
    'Special Allowance (₹)', 'LTA (₹)', 'Flexi Total (₹)',
    'Retention Bonus (₹)', 'Joining Bonus (₹)', 'Incentives (₹)',
    'Compa Ratio (%)', 'Pay Range Penetration (%)',
    'April 2023 Fixed', 'July 2023 Fixed', 'April 2024 Fixed', 'July 2024 Fixed',
    'Last Increment Date', 'Last Increment %',
    'Cost Center', 'Criticality', 'Attrition Risk Score',
  ];
  const empRows = employees.map(e => [
    e.employeeId, e.firstName, e.lastName, e.email, e.department, e.designation,
    e.band, e.grade, e.employmentType, e.employmentStatus, e.gender,
    e.workMode, e.workLocation || '', fmtDate(e.dateOfJoining), fmtDate(e.dateOfExit),
    fmt(e.annualFixed), fmt(e.variablePay), fmt(e.annualCtc),
    fmt(e.basicAnnual), fmt(e.hra), fmt(e.pfYearly),
    fmt(e.specialAllowance), fmt(e.lta), fmt(e.flexiTotalYearly),
    fmt(e.retentionBonus), fmt(e.joiningBonus), fmt(e.incentives),
    fmt(e.compaRatio), fmt(e.payRangePenetration),
    fmt(e.april2023), fmt(e.july2023), fmt(e.april2024), fmt(e.july2024),
    fmtDate(e.lastIncrementDate), fmt(e.lastIncrementPercent),
    e.costCenter || '', e.criticality || '', fmt(e.attritionRiskScore),
  ]);
  const wsEmp = XLSX.utils.aoa_to_sheet([empHeaders, ...empRows]);
  wsEmp['!cols'] = empHeaders.map(() => ({ wch: 20 }));
  XLSX.utils.book_append_sheet(wb, wsEmp, 'Employees');

  // ── Sheet 3: Compensation rollup (Band × Dept) ───────────────
  const compMap: Record<string, {
    count: number; fixedSum: number; ctcSum: number;
    compaSum: number; compaCount: number; varCount: number;
    fixedMin: number; fixedMax: number;
  }> = {};
  employees.forEach(e => {
    const key = `${e.band}||${e.department}`;
    if (!compMap[key]) compMap[key] = { count: 0, fixedSum: 0, ctcSum: 0, compaSum: 0, compaCount: 0, varCount: 0, fixedMin: Infinity, fixedMax: -Infinity };
    const c = compMap[key];
    c.count++;
    c.fixedSum += fmt(e.annualFixed);
    c.ctcSum   += fmt(e.annualCtc);
    if (e.compaRatio !== null) { c.compaSum += fmt(e.compaRatio); c.compaCount++; }
    if (fmt(e.variablePay) > 0) c.varCount++;
    c.fixedMin = Math.min(c.fixedMin, fmt(e.annualFixed));
    c.fixedMax = Math.max(c.fixedMax, fmt(e.annualFixed));
  });
  const compHeaders = [
    'Band', 'Department', 'Headcount',
    'Avg Annual Fixed (₹)', 'Min Fixed (₹)', 'Max Fixed (₹)',
    'Avg Annual CTC (₹)', 'Avg Compa Ratio (%)', 'Employees with Variable (%)',
  ];
  const compRows = Object.entries(compMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [band, dept] = key.split('||');
      return [
        band, dept, v.count,
        v.count ? Math.round(v.fixedSum / v.count) : 0,
        v.fixedMin === Infinity ? 0 : v.fixedMin,
        v.fixedMax === -Infinity ? 0 : v.fixedMax,
        v.count ? Math.round(v.ctcSum / v.count) : 0,
        v.compaCount ? parseFloat((v.compaSum / v.compaCount).toFixed(1)) : 0,
        v.count ? parseFloat(((v.varCount / v.count) * 100).toFixed(1)) : 0,
      ];
    });
  const wsComp = XLSX.utils.aoa_to_sheet([compHeaders, ...compRows]);
  wsComp['!cols'] = compHeaders.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, wsComp, 'Compensation');

  // ── Sheet 4: Benefits (all statuses) ────────────────────────
  const benHeaders = [
    'Employee ID', 'Employee Name', 'Department',
    'Benefit Name', 'Category', 'Status',
    'Utilization (%)', 'Utilized Value (₹)', 'Enrolled Date', 'Expiry Date',
  ];
  const benRows = benefits.map(b => [
    b.employee.employeeId,
    `${b.employee.firstName} ${b.employee.lastName}`,
    b.employee.department,
    b.benefit.name,
    b.benefit.category,
    b.status,
    b.utilizationPercent !== null ? fmt(b.utilizationPercent) : '',
    b.utilizedValue !== null ? fmt(b.utilizedValue) : '',
    fmtDate(b.enrolledAt),
    fmtDate(b.expiresAt),
  ]);
  const wsBen = XLSX.utils.aoa_to_sheet([benHeaders, ...benRows]);
  wsBen['!cols'] = benHeaders.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(wb, wsBen, 'Benefits');

  return wb;
}

// ─── Orchestrator ────────────────────────────────────────────
export async function generateFullReport(): Promise<Buffer> {
  const { employees, benefits } = await fetchReportData();
  const stats = computeStats(employees, benefits);
  const aiSummary = await generateAiSummary(stats);
  const exportDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const wb = buildWorkbook(employees, benefits, aiSummary, exportDate);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
