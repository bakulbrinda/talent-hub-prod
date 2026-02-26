import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/redis';

const TTL = 120; // 2 minutes

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try { const h = await cacheGet<T>(key); if (h) return h; } catch (_) {}
  const r = await fn();
  try { await cacheSet(key, r, TTL); } catch (_) {}
  return r;
}

export const payEquityService = {
  getGenderPayGap: (filters?: { department?: string; band?: string }) =>
    cached(`pay-equity:gender-gap:${JSON.stringify(filters)}`, async () => {
      const where: any = { employmentStatus: 'ACTIVE' };
      if (filters?.department) where.department = filters.department;
      if (filters?.band) where.band = filters.band;

      const rows = await prisma.employee.groupBy({
        by: ['department', 'gender'],
        where,
        _avg: { annualFixed: true },
        _count: true,
      });

      // Build department map
      const deptMap: Record<string, { male: number; female: number; maleCount: number; femaleCount: number }> = {};
      for (const r of rows) {
        if (!deptMap[r.department]) deptMap[r.department] = { male: 0, female: 0, maleCount: 0, femaleCount: 0 };
        if (r.gender === 'MALE') {
          deptMap[r.department].male = Number(r._avg.annualFixed);
          deptMap[r.department].maleCount = r._count;
        }
        if (r.gender === 'FEMALE') {
          deptMap[r.department].female = Number(r._avg.annualFixed);
          deptMap[r.department].femaleCount = r._count;
        }
      }

      const byDept = Object.entries(deptMap).map(([dept, v]) => ({
        department: dept,
        maleAvg: v.male,
        femaleAvg: v.female,
        maleCount: v.maleCount,
        femaleCount: v.femaleCount,
        gapPercent: v.male > 0 ? ((v.male - v.female) / v.male) * 100 : 0,
        gapAmount: v.male - v.female,
      }));

      // Overall gap
      const overall = await prisma.employee.groupBy({
        by: ['gender'],
        where: { employmentStatus: 'ACTIVE' },
        _avg: { annualFixed: true },
        _count: true,
      });
      const maleRow = overall.find(r => r.gender === 'MALE');
      const femaleRow = overall.find(r => r.gender === 'FEMALE');
      const maleAvg = Number(maleRow?._avg.annualFixed) || 0;
      const femaleAvg = Number(femaleRow?._avg.annualFixed) || 0;

      return {
        overall: {
          maleAvg,
          femaleAvg,
          maleCount: maleRow?._count || 0,
          femaleCount: femaleRow?._count || 0,
          gapPercent: maleAvg > 0 ? ((maleAvg - femaleAvg) / maleAvg) * 100 : 0,
          gapAmount: maleAvg - femaleAvg,
        },
        byDepartment: byDept.sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent)),
      };
    }),

  getCompaRatioDistribution: (filters?: { band?: string; department?: string }) =>
    cached(`pay-equity:cr-dist:${JSON.stringify(filters)}`, async () => {
      const where: any = { employmentStatus: 'ACTIVE', compaRatio: { not: null } };
      if (filters?.band) where.band = filters.band;
      if (filters?.department) where.department = filters.department;

      const employees = await prisma.employee.findMany({
        where,
        select: { compaRatio: true, band: true, department: true, gender: true },
      });

      const bins = [
        { label: '<70%', min: 0, max: 70 },
        { label: '70-80%', min: 70, max: 80 },
        { label: '80-90%', min: 80, max: 90 },
        { label: '90-100%', min: 90, max: 100 },
        { label: '100-110%', min: 100, max: 110 },
        { label: '110-120%', min: 110, max: 120 },
        { label: '>120%', min: 120, max: Infinity },
      ];

      return bins.map(bin => ({
        label: bin.label,
        count: employees.filter(e => {
          const cr = Number(e.compaRatio);
          return cr >= bin.min && cr < bin.max;
        }).length,
      }));
    }),

  getHeatmap: () =>
    cached('pay-equity:heatmap', async () => {
      const rows = await prisma.employee.groupBy({
        by: ['department', 'band'],
        where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } },
        _avg: { compaRatio: true },
        _count: true,
      });

      return rows.map(r => ({
        department: r.department,
        band: r.band,
        avgCompaRatio: Number(r._avg.compaRatio) || 0,
        count: r._count,
      }));
    }),

  getScore: () =>
    cached('pay-equity:score', async () => {
      const [genderGap, distribution, outliers, total] = await Promise.all([
        payEquityService.getGenderPayGap(),
        payEquityService.getCompaRatioDistribution(),
        prisma.employee.count({
          where: { employmentStatus: 'ACTIVE', OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }] },
        }),
        prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
      ]);

      // Score components (0-100, higher is better)
      const gapPct = Math.abs(genderGap.overall.gapPercent);
      const genderScore = Math.max(0, 100 - gapPct * 5); // -5 per percent gap

      const inRangeCount = distribution.find(d => d.label === '90-100%')?.count || 0;
      const adjacent1 = distribution.find(d => d.label === '80-90%')?.count || 0;
      const adjacent2 = distribution.find(d => d.label === '100-110%')?.count || 0;
      const compaScore = total > 0 ? ((inRangeCount + adjacent1 * 0.7 + adjacent2 * 0.7) / total) * 100 : 50;

      const outlierScore = total > 0 ? Math.max(0, 100 - (outliers / total) * 200) : 50;

      const score = genderScore * 0.4 + compaScore * 0.3 + outlierScore * 0.3;

      return {
        score: Math.round(Math.max(0, Math.min(100, score))),
        components: {
          genderScore: Math.round(genderScore),
          compaScore: Math.round(compaScore),
          outlierScore: Math.round(outlierScore),
        },
        gapPercent: gapPct,
        outlierCount: outliers,
        totalEmployees: total,
      };
    }),

  getOutliers: () =>
    cached('pay-equity:outliers', async () => {
      return prisma.employee.findMany({
        where: {
          employmentStatus: 'ACTIVE',
          OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }],
        },
        select: {
          id: true, firstName: true, lastName: true, department: true,
          band: true, designation: true, annualFixed: true, compaRatio: true, gender: true,
        },
        orderBy: { compaRatio: 'asc' },
      });
    }),

  getNewHireParity: () =>
    cached('pay-equity:new-hire-parity', async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const [newHires, existing] = await Promise.all([
        prisma.employee.groupBy({
          by: ['department', 'band'],
          where: { employmentStatus: 'ACTIVE', dateOfJoining: { gte: sixMonthsAgo } },
          _avg: { annualFixed: true },
          _count: true,
        }),
        prisma.employee.groupBy({
          by: ['department', 'band'],
          where: { employmentStatus: 'ACTIVE', dateOfJoining: { lt: sixMonthsAgo } },
          _avg: { annualFixed: true },
          _count: true,
        }),
      ]);

      const existingMap = new Map(
        existing.map(e => [`${e.department}:${e.band}`, e])
      );

      return newHires
        .filter(nh => existingMap.has(`${nh.department}:${nh.band}`))
        .map(nh => {
          const ex = existingMap.get(`${nh.department}:${nh.band}`)!;
          const newAvg = Number(nh._avg.annualFixed);
          const exAvg = Number(ex._avg.annualFixed);
          return {
            department: nh.department,
            band: nh.band,
            newHireAvg: newAvg,
            existingAvg: exAvg,
            newHireCount: nh._count,
            existingCount: ex._count,
            parityPercent: exAvg > 0 ? (newAvg / exAvg) * 100 : 100,
            issue: newAvg > exAvg * 1.1 ? 'NEW_HIRE_PREMIUM' : newAvg < exAvg * 0.9 ? 'EXISTING_UNDERPAID' : 'PARITY',
          };
        })
        .filter(r => r.issue !== 'PARITY')
        .sort((a, b) => Math.abs(b.parityPercent - 100) - Math.abs(a.parityPercent - 100));
    }),
};
