/**
 * orgSnapshot — gathers a compact, Claude-ready summary of the org's
 * current compensation state in a single batched DB call.
 */
import { prisma } from '../lib/prisma';

export interface OrgSnapshot {
  generatedAt: string;
  totalEmployees: number;
  avgCompaRatio: number;
  // Employees with key comp fields (compact — no PII emails)
  employees: Array<{
    id: string;
    name: string;
    band: string;
    department: string;
    gender: string;
    annualFixedLakhs: number;
    compaRatio: number | null;
    daysSinceJoining: number;
    latestPerfRating: number | null;
  }>;
  // Salary bands with range info
  bands: Array<{
    code: string;
    minLakhs: number;
    midLakhs: number;
    maxLakhs: number;
  }>;
  // Gender pay averages by department
  genderByDept: Array<{
    department: string;
    gender: string;
    avgLakhs: number;
    count: number;
  }>;
  // Employees with significant unvested RSU value (sourced from EmployeeBenefit EQUITY)
  rsuCliff: Array<{
    employeeName: string;
    unvestedLakhs: number;
    vestingPct: number;
  }>;
  // Benefits utilization
  benefits: Array<{
    name: string;
    category: string;
    enrolledCount: number;
    totalEmployees: number;
    utilizationPct: number;
  }>;
}

async function fetchSnapshot(): Promise<OrgSnapshot> {
  const now = new Date();

  const [employees, salaryBands, genderGroups, equityBenefits, benefitCatalog, benefitEnrollments, totalEmp] =
    await Promise.all([
      // Core employee data + latest perf rating
      prisma.employee.findMany({
        where: { employmentStatus: 'ACTIVE' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          band: true,
          department: true,
          gender: true,
          annualFixed: true,
          compaRatio: true,
          dateOfJoining: true,
          performanceRatings: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { rating: true },
          },
        },
      }),

      // All salary bands
      prisma.salaryBand.findMany({
        include: { band: true },
      }),

      // Gender pay gap by dept
      prisma.employee.groupBy({
        by: ['department', 'gender'],
        where: { employmentStatus: 'ACTIVE' },
        _avg: { annualFixed: true },
        _count: true,
      }),

      // RSU cliff: employees with large unvested RSU value (EmployeeBenefit EQUITY)
      // Unvested value = utilizedValue / utilizationPercent * (100 - utilizationPercent)
      // Flag employees where unvested amount >= ₹5L (significant RSU cliff exposure)
      prisma.employeeBenefit.findMany({
        where: {
          status: 'ACTIVE',
          utilizationPercent: { gt: 0, lt: 100 },
          utilizedValue: { gt: 0 },
          benefit: { category: 'EQUITY' },
        },
        include: {
          employee: { select: { firstName: true, lastName: true } },
        },
      }),

      // Benefits catalog
      prisma.benefitsCatalog.findMany({ where: { isActive: true } }),

      // Enrollment counts per benefit
      prisma.employeeBenefit.groupBy({
        by: ['benefitId', 'status'],
        _count: true,
      }),

      // Total active headcount for utilization %
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
    ]);

  // Build compact employee list
  const empList = employees.map(e => ({
    id:               e.id,
    name:             `${e.firstName} ${e.lastName}`,
    band:             e.band,
    department:       e.department,
    gender:           e.gender as string,
    annualFixedLakhs: Math.round(Number(e.annualFixed) / 100000 * 10) / 10,
    compaRatio:       e.compaRatio ? Math.round(Number(e.compaRatio) * 10) / 10 : null,
    daysSinceJoining: Math.floor((now.getTime() - new Date(e.dateOfJoining).getTime()) / 86400000),
    latestPerfRating: e.performanceRatings[0]?.rating ? Number(e.performanceRatings[0].rating) : null,
  }));

  // Avg compa ratio
  const withCompa = empList.filter(e => e.compaRatio !== null);
  const avgCompaRatio = withCompa.length
    ? Math.round(withCompa.reduce((s, e) => s + (e.compaRatio || 0), 0) / withCompa.length * 10) / 10
    : 0;

  // Deduplicate salary bands (take first per band code)
  const bandMap = new Map<string, typeof salaryBands[0]>();
  for (const sb of salaryBands) {
    if (!bandMap.has(sb.band.code)) bandMap.set(sb.band.code, sb);
  }
  const bands = Array.from(bandMap.values()).map(sb => ({
    code:    sb.band.code,
    minLakhs: Math.round(Number(sb.minSalary) / 100000 * 10) / 10,
    midLakhs: Math.round(Number(sb.midSalary) / 100000 * 10) / 10,
    maxLakhs: Math.round(Number(sb.maxSalary) / 100000 * 10) / 10,
  }));

  // Gender breakdown by department
  const genderByDept = genderGroups.map(g => ({
    department: g.department,
    gender:     g.gender as string,
    avgLakhs:   Math.round(Number(g._avg?.annualFixed || 0) / 100000 * 10) / 10,
    count:      g._count,
  }));

  // RSU cliff: compute unvested value from EmployeeBenefit EQUITY records
  // unvestedValue = (utilizedValue / utilizationPercent) * (100 - utilizationPercent)
  const RSU_CLIFF_THRESHOLD_LAKHS = 5; // flag employees with ≥ ₹5L unvested
  const rsuCliff = equityBenefits
    .map(eb => {
      const utilized = Number(eb.utilizedValue);
      const pct = Number(eb.utilizationPercent);
      const total = pct > 0 ? (utilized / pct) * 100 : 0;
      const unvested = total - utilized;
      return {
        employeeName: `${eb.employee.firstName} ${eb.employee.lastName}`,
        unvestedLakhs: Math.round(unvested / 100000 * 10) / 10,
        vestingPct: Math.round(pct),
      };
    })
    .filter(r => r.unvestedLakhs >= RSU_CLIFF_THRESHOLD_LAKHS)
    .sort((a, b) => b.unvestedLakhs - a.unvestedLakhs)
    .slice(0, 20); // top 20 by unvested value

  // Benefits utilization
  const benefits = benefitCatalog.map(b => {
    const enrolled = benefitEnrollments.find(en => en.benefitId === b.id && en.status === 'ACTIVE')?._count || 0;
    return {
      name:           b.name,
      category:       b.category as string,
      enrolledCount:  enrolled,
      totalEmployees: totalEmp,
      utilizationPct: totalEmp > 0 ? Math.round(enrolled / totalEmp * 1000) / 10 : 0,
    };
  });

  return {
    generatedAt:    now.toISOString(),
    totalEmployees: totalEmp,
    avgCompaRatio,
    employees:      empList,
    bands,
    genderByDept,
    rsuCliff,
    benefits,
  };
}

/**
 * Public entry point — wraps fetchSnapshot with a Neon wake-up ping + one
 * automatic retry. Neon pauses idle connections after ~5 min; the first query
 * after a pause throws "Server has closed the connection". The ping warms the
 * connection back up so the heavy parallel Promise.all succeeds.
 */
export async function gatherOrgSnapshot(): Promise<OrgSnapshot> {
  // Ping the DB — if the connection was idle/closed this forces a reconnect.
  // We swallow errors here intentionally; Prisma will reconnect for the real queries.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    // Give Neon a moment to fully wake before hitting it with 7 parallel queries.
    await new Promise(r => setTimeout(r, 1500));
  }

  try {
    return await fetchSnapshot();
  } catch (err: any) {
    // One automatic retry — covers the edge case where the ping succeeded on a
    // pooled connection but the subsequent queries still got a stale one.
    if (err?.message?.includes('closed') || err?.message?.includes('connect') || err?.code === 'P1001') {
      await new Promise(r => setTimeout(r, 2000));
      return fetchSnapshot();
    }
    throw err;
  }
}
