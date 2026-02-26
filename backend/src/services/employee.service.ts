import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export interface EmployeeFilters {
  page?: number;
  limit?: number;
  search?: string;
  band?: string;
  department?: string;
  gender?: string;
  workMode?: string;
}

export const employeeService = {
  getAll: async (filters: EmployeeFilters = {}) => {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      employmentStatus: 'ACTIVE',
      ...(filters.search && {
        OR: [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { employeeId: { contains: filters.search, mode: 'insensitive' } },
          { designation: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      ...(filters.band && { band: filters.band }),
      ...(filters.department && { department: filters.department }),
      ...(filters.gender && { gender: filters.gender as any }),
      ...(filters.workMode && { workMode: filters.workMode as any }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ department: 'asc' }, { lastName: 'asc' }],
        select: {
          id: true, employeeId: true, firstName: true, lastName: true,
          email: true, designation: true, department: true, band: true,
          grade: true, annualFixed: true, annualCtc: true,
          workMode: true, workLocation: true, gender: true,
          compaRatio: true, employmentStatus: true,
          dateOfJoining: true,
        },
      }),
      prisma.employee.count({ where }),
    ]);

    return {
      data: employees,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  },

  getById: async (id: string) => {
    return prisma.employee.findUniqueOrThrow({
      where: { id },
      include: {
        jobCode: { include: { band: true, jobFamily: { include: { jobArea: true } } } },
        reportingManager: { select: { id: true, firstName: true, lastName: true, designation: true } },
        skills: { include: { skill: true } },
        performanceRatings: { orderBy: { cycle: 'desc' }, take: 4 },
        benefits: { include: { benefit: true }, where: { status: 'ACTIVE' } },
        rsuGrants: { include: { vestingEvents: { orderBy: { vestingDate: 'asc' } } } },
      },
    });
  },

  create: async (data: any) => {
    const employee = await prisma.employee.create({ data });
    await employeeService.computeAndUpdateDerivedFields(employee.id);
    return prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });
  },

  update: async (id: string, data: any) => {
    const employee = await prisma.employee.update({ where: { id }, data });
    await employeeService.computeAndUpdateDerivedFields(id);
    return prisma.employee.findUniqueOrThrow({ where: { id } });
  },

  getAnalytics: async () => {
    const [total, byBand, byDept, byGender, byWorkMode, avgCompaRatioAgg, outsideBand] = await Promise.all([
      prisma.employee.count({ where: { employmentStatus: 'ACTIVE' } }),
      prisma.employee.groupBy({ by: ['band'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
      prisma.employee.groupBy({ by: ['department'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
      prisma.employee.groupBy({ by: ['gender'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
      prisma.employee.groupBy({ by: ['workMode'], where: { employmentStatus: 'ACTIVE' }, _count: true }),
      prisma.employee.aggregate({ where: { employmentStatus: 'ACTIVE', compaRatio: { not: null } }, _avg: { compaRatio: true } }),
      prisma.employee.count({
        where: {
          employmentStatus: 'ACTIVE',
          OR: [{ compaRatio: { lt: 80 } }, { compaRatio: { gt: 120 } }],
        }
      }),
    ]);
    return {
      total,
      byBand: byBand.map(b => ({ band: b.band, count: b._count })),
      byDepartment: byDept.map(d => ({ department: d.department, count: d._count })),
      byGender: byGender.map(g => ({ gender: g.gender, count: g._count })),
      byWorkMode: byWorkMode.map(w => ({ workMode: w.workMode, count: w._count })),
      avgCompaRatio: Number(avgCompaRatioAgg._avg.compaRatio) || 0,
      employeesOutsideBand: outsideBand,
    };
  },

  computeAndUpdateDerivedFields: async (employeeId: string) => {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return;

    const salaryBand = await prisma.salaryBand.findFirst({
      where: { band: { code: employee.band } },
    });

    if (!salaryBand) return;

    const annualFixed = Number(employee.annualFixed);
    const mid = Number(salaryBand.midSalary);
    const min = Number(salaryBand.minSalary);
    const max = Number(salaryBand.maxSalary);

    const compaRatio = mid > 0 ? (annualFixed / mid) * 100 : null;
    const payRangePenetration = max > min ? ((annualFixed - min) / (max - min)) * 100 : null;

    const joiningDate = new Date(employee.dateOfJoining);
    const now = new Date();
    const timeInCurrentGrade = Math.floor(
      (now.getTime() - joiningDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );

    await prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(compaRatio !== null && { compaRatio }),
        ...(payRangePenetration !== null && { payRangePenetration }),
        timeInCurrentGrade,
      },
    });
  },
};
