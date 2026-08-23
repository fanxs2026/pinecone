import apiClient from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  inviteCode?: string;
}

export interface AuthResponse {
  accessToken: string;
  /** 兼容字段：M-01 起 refresh token 仅存 httpOnly cookie（pinecone-refresh），后端响应不再下发 */
  refreshToken?: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/login', data);
    return res.data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/register', data);
    return res.data;
  },

  forgotPassword: async (data: { email: string }): Promise<{ emailSent: boolean; mode: string; resetToken?: string }> => {
    const res = await apiClient.post('/auth/forgot-password', data);
    return res.data;
  },

  resetPassword: async (data: { token: string; newPassword: string }): Promise<{ success: boolean }> => {
    const res = await apiClient.post('/auth/reset-password', data);
    return res.data;
  },

  refresh: async (): Promise<AuthResponse> => {
    // P1-3（2026-08-21）：契约对齐——refresh token 已迁移到 httpOnly cookie（pinecone-refresh），
    // 由浏览器自动携带（apiClient 默认 withCredentials），不再从内存/body 传递；
    // 与 api.ts 拦截器 doRefresh() 走同一路径（历史遗留的内存 refreshToken 路径已删除）。
    const res = await apiClient.post('/auth/refresh', {}, { withCredentials: true });
    return res.data;
  },

  me: async () => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },
};
