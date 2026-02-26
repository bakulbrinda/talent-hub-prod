import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@shared/types/index';
import { setAccessToken, clearTokens } from '../lib/api';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;

  setAuth: (data: { user: AuthUser; accessToken: string; refreshToken: string }) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
  setHasHydrated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      setAuth: ({ user, accessToken, refreshToken }) => {
        setAccessToken(accessToken);
        // Keep standalone key so axios interceptor can read refreshToken directly
        sessionStorage.setItem('refreshToken', refreshToken);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      setAccessToken: (token) => {
        setAccessToken(token);
        set({ accessToken: token });
      },

      logout: () => {
        clearTokens();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      setHasHydrated: (val) => set({ _hasHydrated: val }),
    }),
    {
      name: 'compsense-auth',
      // sessionStorage: clears on window close — every fresh open starts at login
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) {
          // Sync persisted token back into the axios interceptor
          setAccessToken(state.accessToken);
          if (state.refreshToken) {
            sessionStorage.setItem('refreshToken', state.refreshToken);
          }
        }
        state?.setHasHydrated(true);
      },
    }
  )
);
