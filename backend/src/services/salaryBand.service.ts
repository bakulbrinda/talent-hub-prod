import { prisma } from '../lib/prisma';
import { cacheDelPattern } from '../lib/redis';
import { emitSalaryBandUpdated } from '../lib/socket';
import { employeeService } from './employee.service';

export const salaryBandService = {
  getAll: async (filters?: { bandId?: string; jobAreaId?: string }) => {
    return prisma.salaryBand.findMany({
      where: {
        ...(filters?.bandId && { bandId: filters.bandId }),
        ...(filters?.jobAreaId && { jobAreaId: filters.jobAreaId }),
      },
      include: { band: true, jobArea: true },
      orderBy: [{ band: { level: 'asc' } }],
    });
  },

  create: async (data: any) => {
    let bandId = data.bandId;

    if (!bandId && data.bandCode) {
      const code = String(data.bandCode).trim().toUpperCase();
      let band = await prisma.band.findUnique({ where: { code } });
      if (!band) {
        const maxBand = await prisma.band.findFirst({ orderBy: { level: 'desc' } });
        const nextLevel = (maxBand?.level ?? 0) + 1;
        band = await prisma.band.create({
          data: {
            code,
            label: data.bandLabel?.trim() || code,
            level: nextLevel,
            isEligibleForRSU: false,
          },
        });
      }
      bandId = band.id;
    }

    const { bandCode: _bc, bandLabel: _bl, ...rest } = data;
    return prisma.salaryBand.create({
      data: { ...rest, bandId },
      include: { band: true, jobArea: true },
    });
  },

  update: async (id: string, data: any) => {
    // Fetch the band code before updating so we can target the right employees
    const existing = await prisma.salaryBand.findUniqueOrThrow({
      where: { id },
      include: { band: true },
    });

    const updated = await prisma.salaryBand.update({
      where: { id },
      data,
      include: { band: true },
    });

    // Batch-recalculate compa-ratio + payRangePenetration for every active
    // employee in this band — their derived fields are now stale.
    const affectedEmployees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', band: existing.band.code },
      select: { id: true },
    });

    await Promise.allSettled(
      affectedEmployees.map(e => employeeService.computeAndUpdateDerivedFields(e.id))
    );

    // Bust every cache that aggregates compa-ratio or pay-range data
    await Promise.allSettled([
      cacheDelPattern('dashboard:*'),
      cacheDelPattern('pay-equity:*'),
      cacheDelPattern('salary-bands:*'),
      cacheDelPattern('performance:*'),
    ]);

    // Notify all connected clients so their React Query caches refetch
    emitSalaryBandUpdated();

    return updated;
  },

  deleteSalaryBand: async (id: string) => {
    await prisma.salaryBand.findUniqueOrThrow({ where: { id } });
    await prisma.salaryBand.delete({ where: { id } });
    await Promise.allSettled([
      cacheDelPattern('dashboard:*'),
      cacheDelPattern('pay-equity:*'),
      cacheDelPattern('salary-bands:*'),
      cacheDelPattern('performance:*'),
    ]);
    emitSalaryBandUpdated();
  },

  getMarketBenchmarks: async (filters?: { bandId?: string; location?: string }) => {
    return prisma.marketBenchmark.findMany({
      where: {
        ...(filters?.bandId && { bandId: filters.bandId }),
        ...(filters?.location && { location: { contains: filters.location, mode: 'insensitive' } }),
      },
      include: { band: true, jobCode: true },
      orderBy: { band: { level: 'asc' } },
    });
  },

  getOutliers: async () => {
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: {
        id: true, firstName: true, lastName: true,
        band: true, department: true, annualFixed: true,
        compaRatio: true, designation: true,
      },
    });

    const bands = await prisma.salaryBand.findMany({ include: { band: true } });

    // Prefer the "All Departments" (null jobAreaId) record per band code.
    // Fall back to the first record found for that code.
    const bandMap = new Map<string, (typeof bands)[number]>();
    for (const sb of bands) {
      const code = sb.band.code;
      const existing = bandMap.get(code);
      if (!existing || sb.jobAreaId === null) {
        bandMap.set(code, sb);
      }
    }

    return employees
      .filter(emp => {
        const sb = bandMap.get(emp.band);
        if (!sb) return false;
        const salary = Number(emp.annualFixed);
        return salary < Number(sb.minSalary) || salary > Number(sb.maxSalary);
      })
      .map(emp => {
        const sb = bandMap.get(emp.band)!;
        const salary = Number(emp.annualFixed);
        const minSalary = Number(sb.minSalary);
        const maxSalary = Number(sb.maxSalary);
        return {
          ...emp,
          minSalary,
          midSalary: Number(sb.midSalary),
          maxSalary,
          delta: salary < minSalary ? salary - minSalary : salary - maxSalary,
        };
      });
  },
};
