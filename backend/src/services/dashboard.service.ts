import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';
import { BAND_ORDER } from '../types/index';
import { getAiInferredPerformance } from './aiPerformanceInference';

const CACHE_TTL = 30; // seconds

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const hit = await cacheGet<T>(key);
    if (hit) return hit;
  } catch (_) {}
  const result = await fn();
  try {
    await cacheSet(key, result, CACHE_TTL);
  } catch (_) {}
  return result;
}

export const dashboardService = {
  getKpis: () => cached('dashboard:kpis', async () => {
    const [totalEmployees, totalCtcAgg, avgCompaRatioAgg, outsideBand, maleAvg, femaleAvg] = await Promise.all([
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE' }, _sum: { annualCtc: true } }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } }, _avg: { compaRatio: true } }),
      prisma.employee.count({
        where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] }
      }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', gender: 'MALE' }, _avg: { annualFixed: true } }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', gender: 'FEMALE' }, _avg: { annualFixed: true } }),
    ]);

    const maleAvgVal = Number(maleAvg._avg.annualFixed) || 0;
    const femaleAvgVal = Number(femaleAvg._avg.annualFixed) || 0;
    const genderPayGap = maleAvgVal > 0 ? ((maleAvgVal - femaleAvgVal) / maleAvgVal) * 100 : 0;

    return {
      totalEmployees,
      totalAnnualCtcCrores: Number(totalCtcAgg._sum.annualCtc) / 10000000,
      avgCompaRatio: Number(avgCompaRatioAgg._avg.compaRatio) || 0,
      employeesOutsideBand: outsideBand,
      genderPayGapPercent: genderPayGap,
    };
  }),

  getBandDistribution: () => cached('dashboard:band-dist', async () => {
    const result = await prisma.employee.groupBy({
      by: ['band'],
      where: { employmentStatus: 'ACTIVE' },
      _count: true,
    });
    return result
      .sort((a, b) => {
        const ai = BAND_ORDER.indexOf(a.band as typeof BAND_ORDER[number]);
        const bi = BAND_ORDER.indexOf(b.band as typeof BAND_ORDER[number]);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
      .map(r => ({ band: r.band, count: r._count }));
  }),

  getSalaryDistribution: () => cached('dashboard:salary-dist', async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: { annualFixed: true },
    });
    const bins = [0, 500000, 1000000, 1500000, 2000000, 3000000, 5000000, Infinity];
    const labels = ['<5L', '5-10L', '10-15L', '15-20L', '20-30L', '30-50L', '>50L'];
    const counts = new Array(labels.length).fill(0);
    for (const emp of employees) {
      const val = Number(emp.annualFixed);
      for (let i = 0; i < bins.length - 1; i++) {
        if (val >= bins[i] && val < bins[i + 1]) { counts[i]++; break; }
      }
    }
    return labels.map((label, i) => ({ label, count: counts[i] }));
  }),

  getCompensationTrend: () => cached('dashboard:comp-trend', async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: { april2023: true, july2023: true, april2024: true, july2024: true, annualFixed: true },
    });
    const cycles = [
      { key: 'april2023', label: 'Apr 2023' },
      { key: 'july2023', label: 'Jul 2023' },
      { key: 'april2024', label: 'Apr 2024' },
      { key: 'july2024', label: 'Jul 2024' },
    ];
    return cycles.map(({ key, label }) => {
      const vals = employees.map(e => Number((e as any)[key])).filter(v => v > 0);
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const sorted = [...vals].sort((a, b) => a - b);
      const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
      return { label, avg, median, count: vals.length };
    });
  }),

  getPayEquitySummary: () => cached('dashboard:equity-summary', async () => {
    const depts = await prisma.employee.groupBy({
      by: ['department', 'gender'],
      where: { employmentStatus: 'ACTIVE' },
      _avg: { annualFixed: true },
      _count: true,
    });
    const deptMap: Record<string, { male: number; female: number }> = {};
    for (const row of depts) {
      if (!deptMap[row.department]) deptMap[row.department] = { male: 0, female: 0 };
      if (row.gender === 'MALE') deptMap[row.department].male = Number(row._avg.annualFixed);
      if (row.gender === 'FEMALE') deptMap[row.department].female = Number(row._avg.annualFixed);
    }
    return Object.entries(deptMap)
      .map(([dept, avgs]) => ({
        department: dept,
        maleAvg: avgs.male,
        femaleAvg: avgs.female,
        gapPercent: avgs.male > 0 ? ((avgs.male - avgs.female) / avgs.male) * 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent))
      .slice(0, 3);
  }),

  // ── feat-003 new endpoints ─────────────────────────────────────

  getCompVsPerformancePlot: () => cached('dashboard:comp-vs-perf', async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
      select: {
        id: true, firstName: true, lastName: true, compaRatio: true, band: true,
        department: true, dateOfJoining: true,
        performanceRatings: { orderBy: { cycle: 'desc' }, take: 1 },
      },
    });
    const now = new Date();

    const withRealRatings = employees.filter(e => e.performanceRatings.length > 0);

    // Use real ratings when available, otherwise fall back to AI-inferred tiers
    if (withRealRatings.length > 0) {
      return withRealRatings.map(e => ({
        name: `${e.firstName} ${e.lastName}`,
        compaRatio: Number(e.compaRatio),
        performanceRating: Number(e.performanceRatings[0].rating),
        tenureMonths: Math.floor((now.getTime() - new Date(e.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30)),
        band: e.band,
        department: e.department,
      }));
    }

    const inferred = await getAiInferredPerformance();
    return employees
      .filter(e => inferred.has(e.id))
      .map(e => ({
        name: `${e.firstName} ${e.lastName}`,
        compaRatio: Number(e.compaRatio),
        performanceRating: inferred.get(e.id)!.rating,
        tenureMonths: Math.floor((now.getTime() - new Date(e.dateOfJoining).getTime()) / (1000 * 60 * 60 * 24 * 30)),
        band: e.band,
        department: e.department,
      }));
  }),

  getDeptPayEquityHeatmap: () => cached('dashboard:equity-heatmap', async () => {
    const rows = await prisma.employee.groupBy({
      by: ['department', 'gender'],
      where: { employmentStatus: 'ACTIVE' },
      _avg: { annualFixed: true },
      _count: true,
    });
    const deptMap: Record<string, { male: number; female: number; maleCount: number; femaleCount: number }> = {};
    for (const row of rows) {
      if (!deptMap[row.department]) deptMap[row.department] = { male: 0, female: 0, maleCount: 0, femaleCount: 0 };
      if (row.gender === 'MALE') { deptMap[row.department].male = Number(row._avg.annualFixed); deptMap[row.department].maleCount = row._count; }
      if (row.gender === 'FEMALE') { deptMap[row.department].female = Number(row._avg.annualFixed); deptMap[row.department].femaleCount = row._count; }
    }
    return Object.entries(deptMap)
      .map(([dept, v]) => ({
        department: dept,
        maleAvg: v.male,
        femaleAvg: v.female,
        maleCount: v.maleCount,
        femaleCount: v.femaleCount,
        gapPercent: v.male > 0 ? ((v.male - v.female) / v.male) * 100 : 0,
      }))
      .sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent));
  }),

  getRsuVestingTimeline: () => cached('dashboard:rsu-timeline', async () => {
    const now = new Date();
    // RSU data lives in EmployeeBenefit (EQUITY category), not the empty RsuVestingEvent table.
    // Estimate upcoming annual vest anniversaries within the next 12 months.
    const benefits = await prisma.employeeBenefit.findMany({
      where: {
        status: 'ACTIVE',
        benefit: { category: 'EQUITY' },
        utilizationPercent: { lt: 100 },
      },
      include: { benefit: { select: { annualValue: true } } },
    });

    const monthMap: Record<string, { count: number; approxValue: number }> = {};
    const cutoff = new Date(now.getFullYear(), now.getMonth() + 12, 1);

    for (const b of benefits) {
      const grantDate = new Date(b.enrolledAt);
      const vestedPct = Number(b.utilizationPercent ?? 0);
      const remainingPct = 100 - vestedPct;
      if (remainingPct <= 0) continue;
      const totalValue = Number(b.benefit.annualValue ?? 0);

      // Find the next grant-date anniversary within the next 12 months
      let nextVest = new Date(grantDate);
      nextVest.setFullYear(now.getFullYear());
      if (nextVest <= now) nextVest.setFullYear(now.getFullYear() + 1);
      if (nextVest >= cutoff) continue;

      const key = `${nextVest.getFullYear()}-${String(nextVest.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { count: 0, approxValue: 0 };
      monthMap[key].count++;
      monthMap[key].approxValue += totalValue * (remainingPct / 100);
    }

    const result = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({
        month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count: monthMap[key]?.count ?? 0,
        units: 0,
        approxValue: monthMap[key]?.approxValue ?? 0,
      });
    }
    return result;
  }),

  getAttritionRiskDistribution: () => cached('dashboard:attrition-risk', async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: { attritionRiskScore: true },
    });
    let low = 0, medium = 0, high = 0;
    for (const emp of employees) {
      const score = Number(emp.attritionRiskScore) ?? 0;
      if (score < 33) low++;
      else if (score < 66) medium++;
      else high++;
    }
    return [
      { risk: 'Low', count: low },
      { risk: 'Medium', count: medium },
      { risk: 'High', count: high },
    ];
  }),

  getActionRequired: () => cached('dashboard:action-required', async () => {
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Find the latest performance cycle so we only count current low-performers
    const latestCycleRow = await prisma.performanceRating.findFirst({
      orderBy: { cycle: 'desc' },
      select: { cycle: true },
    });

    const [outsideBand, deptRows, activeEquityEnrollments, lowPerfCount] = await Promise.all([
      prisma.employee.count({
        where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] },
      }),
      prisma.employee.groupBy({
        by: ['department', 'gender'],
        where: { employmentStatus: 'ACTIVE' },
        _avg: { annualFixed: true },
      }),
      // Count employees with active unvested RSU grants (from EmployeeBenefit EQUITY records)
      prisma.employeeBenefit.count({
        where: {
          status: 'ACTIVE',
          utilizationPercent: { lt: 100 },
          benefit: { category: 'EQUITY' },
        },
      }),
      latestCycleRow
        ? prisma.performanceRating.count({
            where: {
              cycle: latestCycleRow.cycle,
              rating: { lt: 3 },
              employee: { employmentStatus: 'ACTIVE' },
            },
          })
        : Promise.resolve(0),
    ]);

    const deptMap: Record<string, { male: number; female: number }> = {};
    for (const row of deptRows) {
      if (!deptMap[row.department]) deptMap[row.department] = { male: 0, female: 0 };
      if (row.gender === 'MALE') deptMap[row.department].male = Number(row._avg.annualFixed);
      if (row.gender === 'FEMALE') deptMap[row.department].female = Number(row._avg.annualFixed);
    }
    const highGapDepts = Object.values(deptMap).filter(
      v => v.male > 0 && ((v.male - v.female) / v.male) * 100 > 15
    ).length;

    const items: { type: string; severity: 'high' | 'medium'; message: string; link: string; count: number }[] = [];
    if (outsideBand > 0) items.push({ type: 'band', severity: 'high', message: `${outsideBand} employee${outsideBand !== 1 ? 's' : ''} outside salary band`, link: '/salary-bands', count: outsideBand });
    if (highGapDepts > 0) items.push({ type: 'equity', severity: 'high', message: `${highGapDepts} department${highGapDepts !== 1 ? 's' : ''} with gender pay gap > 15%`, link: '/pay-equity', count: highGapDepts });
    if (activeEquityEnrollments > 0) items.push({ type: 'rsu', severity: 'medium', message: `${activeEquityEnrollments} employee${activeEquityEnrollments !== 1 ? 's' : ''} with active unvested RSU grants`, link: '/benefits', count: activeEquityEnrollments });
    if (lowPerfCount > 0) items.push({ type: 'performance', severity: 'medium', message: `${lowPerfCount} employee${lowPerfCount !== 1 ? 's' : ''} with performance rating below 3.0`, link: '/performance', count: lowPerfCount });
    return items;
  }),
};
