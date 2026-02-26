import { api } from '../lib/api';

export const jobArchitectureService = {
  getHierarchy: async () => {
    const res = await api.get<{ data: any[] }>('/job-architecture/hierarchy');
    return res.data;
  },
  getJobAreas: async () => {
    const res = await api.get<{ data: any[] }>('/job-areas');
    return res.data;
  },
  getJobFamilies: async (jobAreaId?: string) => {
    const res = await api.get<{ data: any[] }>(`/job-families${jobAreaId ? `?jobAreaId=${jobAreaId}` : ''}`);
    return res.data;
  },
  getBands: async () => {
    const res = await api.get<{ data: any[] }>('/bands');
    return res.data;
  },
  getGrades: async (bandId?: string) => {
    const res = await api.get<{ data: any[] }>(`/grades${bandId ? `?bandId=${bandId}` : ''}`);
    return res.data;
  },
  getJobCodes: async (filters?: { bandId?: string; jobFamilyId?: string }) => {
    const params = new URLSearchParams(filters as any);
    const res = await api.get<{ data: any[] }>(`/job-codes?${params}`);
    return res.data;
  },
  getSkills: async () => {
    const res = await api.get<{ data: any[] }>('/skills');
    return res.data;
  },
};
