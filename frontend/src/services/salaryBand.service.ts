import { api } from '../lib/api';

export const salaryBandService = {
  getAll: async (filters?: { bandId?: string; jobAreaId?: string }) => {
    const params = filters ? new URLSearchParams(filters as any) : '';
    const res = await api.get<{ data: any[] }>(`/salary-bands?${params}`);
    return res.data;
  },
  create: async (data: any) => {
    const res = await api.post<{ data: any }>('/salary-bands', data);
    return res.data;
  },
  update: async (id: string, data: any) => {
    const res = await api.put<{ data: any }>(`/salary-bands/${id}`, data);
    return res.data;
  },
  getMarketBenchmarks: async (filters?: { bandId?: string; location?: string }) => {
    const params = filters ? new URLSearchParams(filters as any) : '';
    const res = await api.get<{ data: any[] }>(`/salary-bands/market-benchmarks?${params}`);
    return res.data;
  },
  getOutliers: async () => {
    const res = await api.get<{ data: any[] }>('/salary-bands/analysis/outliers');
    return res.data;
  },
};
