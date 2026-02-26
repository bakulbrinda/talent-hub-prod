import { prisma } from '../lib/prisma';

export const jobArchitectureService = {
  getHierarchy: async () => {
    return prisma.jobArea.findMany({
      include: {
        jobFamilies: {
          include: {
            jobCodes: {
              include: { band: true, grade: true }
            }
          }
        }
      },
      orderBy: { name: 'asc' }
    });
  },

  getJobAreas: async () => prisma.jobArea.findMany({ orderBy: { name: 'asc' } }),

  createJobArea: async (data: { name: string; description?: string }) =>
    prisma.jobArea.create({ data }),

  updateJobArea: async (id: string, data: { name?: string; description?: string }) =>
    prisma.jobArea.update({ where: { id }, data }),

  getJobFamilies: async (jobAreaId?: string) =>
    prisma.jobFamily.findMany({
      where: jobAreaId ? { jobAreaId } : undefined,
      include: { jobArea: true },
      orderBy: { name: 'asc' }
    }),

  createJobFamily: async (data: { name: string; jobAreaId: string }) =>
    prisma.jobFamily.create({ data }),

  getBands: async () =>
    prisma.band.findMany({ orderBy: { level: 'asc' } }),

  createBand: async (data: { code: string; label: string; level: number; isEligibleForRSU?: boolean }) =>
    prisma.band.create({ data }),

  getGrades: async (bandId?: string) =>
    prisma.grade.findMany({
      where: bandId ? { bandId } : undefined,
      include: { band: true },
      orderBy: { gradeCode: 'asc' }
    }),

  getJobCodes: async (filters?: { bandId?: string; jobFamilyId?: string }) =>
    prisma.jobCode.findMany({
      where: {
        ...(filters?.bandId && { bandId: filters.bandId }),
        ...(filters?.jobFamilyId && { jobFamilyId: filters.jobFamilyId }),
      },
      include: { band: true, jobFamily: { include: { jobArea: true } }, grade: true },
      orderBy: { code: 'asc' }
    }),

  createJobCode: async (data: { code: string; title: string; jobFamilyId: string; bandId: string; gradeId?: string }) =>
    prisma.jobCode.create({ data, include: { band: true, jobFamily: true } }),

  getSkills: async () =>
    prisma.skill.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] }),

  createSkill: async (data: { name: string; category?: string; premiumMultiplier?: number }) =>
    prisma.skill.create({ data }),

  updateSkill: async (id: string, data: { name?: string; category?: string; premiumMultiplier?: number }) =>
    prisma.skill.update({ where: { id }, data }),
};
