import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { disconnectSocket } from '../lib/socket';
import type { LoginResponse } from '@shared/types/index';

export const useLogin = () => {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await api.post<{ data: LoginResponse }>('/auth/login', credentials);
      return res.data.data;
    },
    onSuccess: (data) => {
      setAuth(data);
      toast.success(`Welcome back, ${data.user.name}!`);
      navigate('/dashboard');
    },
    onError: () => {
      toast.error('Invalid email or password');
    },
  });
};

export const useLogout = () => {
  const { logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

  return () => {
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    disconnectSocket();
    logout();
    navigate('/login');
    toast.success('Logged out successfully');
  };
};
