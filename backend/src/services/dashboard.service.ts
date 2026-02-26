import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';

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
    const bandOrder = ['A1', 'A2', 'P1', 'P2', 'P3', 'M1', 'M2', 'D0', 'D1', 'D2'];
    return result
      .sort((a, b) => bandOrder.indexOf(a.band) - bandOrder.indexOf(b.band))
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
};
