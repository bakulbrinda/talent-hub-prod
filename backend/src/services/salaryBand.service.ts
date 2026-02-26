import { prisma } from '../lib/prisma';

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

  update: async (id: string, data: any) =>
    prisma.salaryBand.update({ where: { id }, data, include: { band: true } }),

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
