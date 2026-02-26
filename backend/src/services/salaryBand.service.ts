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

  create: async (data: any) =>
    prisma.salaryBand.create({ data, include: { band: true, jobArea: true } }),

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
    const bandMap = new Map(bands.map(b => [b.band.code, b]));

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
