import { api } from '../lib/api';
import type { Employee } from '@shared/types/index';

export interface EmployeeFilters {
  page?: number;
  limit?: number;
  search?: string;
  band?: string;
  department?: string;
  gender?: string;
  workMode?: string;
}

export interface EmployeesResponse {
  data: Employee[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export const employeeService = {
  getAll: async (filters: EmployeeFilters = {}): Promise<EmployeesResponse> => {
    const params = new URLSearchParams();
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));
    if (filters.search) params.set('search', filters.search);
    if (filters.band) params.set('band', filters.band);
    if (filters.department) params.set('department', filters.department);
    if (filters.gender) params.set('gender', filters.gender);
    if (filters.workMode) params.set('workMode', filters.workMode);
    const res = await api.get<EmployeesResponse>(`/employees?${params}`);
    return res.data;
  },

  getById: async (id: string): Promise<{ data: Employee }> => {
    const res = await api.get<{ data: Employee }>(`/employees/${id}`);
    return res.data;
  },

  create: async (data: Partial<Employee>): Promise<{ data: Employee }> => {
    const res = await api.post<{ data: Employee }>('/employees', data);
    return res.data;
  },

  update: async (id: string, data: Partial<Employee>): Promise<{ data: Employee }> => {
    const res = await api.put<{ data: Employee }>(`/employees/${id}`, data);
    return res.data;
  },

  getAnalytics: async () => {
    const res = await api.get<{ data: any }>('/employees/analytics/summary');
    return res.data;
  },

  importFromFile: async (file: File, mode: 'upsert' | 'replace' = 'upsert'): Promise<{ message: string; total: number; mode: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<{ message: string; total: number; mode: string }>(
      `/import/employees?mode=${mode}`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return res.data;
  },

  downloadTemplate: async (): Promise<void> => {
    const res = await api.get('/import/template', { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employee_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
};
