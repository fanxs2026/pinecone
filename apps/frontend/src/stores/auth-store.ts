import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  isSystemAdmin?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  // refreshToken is no longer stored client-side (it lives in an httpOnly
  // cookie). The parameter is kept for backward compatibility but always null.
  setAuth: (user: User, accessToken: string, refreshToken?: string | null) => void;
  clearAuth: () => void;
}

function setAuthCookie(value: string, days: number) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `pinecone-auth=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function removeAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = 'pinecone-auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax';
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken = null) => {
        setAuthCookie('authenticated', 7);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },
      clearAuth: () => {
        removeAuthCookie();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },
    }),
    {
      name: 'pinecone-auth',
      // M-01：accessToken/refreshToken 不再持久化到 localStorage——
      // token 已迁移 httpOnly cookie（pinecone-access / pinecone-refresh），
      // XSS 无法窃取。此处只持久化 user + 登录态（供刷新页面恢复 UI）。
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
