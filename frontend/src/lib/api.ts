import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// In dev: Vite proxy forwards /api → localhost:3001, so relative path works.
// In production / tunnel: Express serves the frontend, so /api is same-origin.
// Either way, '/api' is always correct and no VITE_API_URL is needed.
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Token Management ─────────────────────────────────────────
// sessionStorage: clears when the browser window/tab is closed.
// This means every fresh browser open starts at the login page (good for demos).
// Within the same window session, auth persists across page refreshes.
const getAccessToken = (): string | null => {
  try {
    return sessionStorage.getItem('accessToken');
  } catch {
    return null;
  }
};

export const setAccessToken = (token: string): void => {
  sessionStorage.setItem('accessToken', token);
};

export const clearTokens = (): void => {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  // Also clear any old localStorage remnants from previous builds
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('compsense-auth');
};

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
};

// ─── Request Interceptor — Attach Token ───────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ─── Response Interceptor — Silent Token Refresh ──────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = sessionStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        const { accessToken } = response.data.data;
        setAccessToken(accessToken);
        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);
