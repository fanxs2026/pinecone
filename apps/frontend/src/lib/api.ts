import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  // M-01：access token 已迁移到 httpOnly cookie（pinecone-access），
  // 请求自动携带（withCredentials: true）。保留 Bearer 仅作为 cookie
  // 不可用时的兜底（如纯 API 客户端），不再作为主认证途径。
  if (typeof window !== 'undefined') {
    const { accessToken } = useAuthStore.getState();
    if (accessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  }
  return config;
});

// Refresh token queue: prevents concurrent refresh requests
let refreshPromise: Promise<void> | null = null;

async function doRefresh(attempt = 1): Promise<void> {
  try {
    // The refresh token lives in the httpOnly `pinecone-refresh` cookie and is
    // sent automatically (withCredentials). No token in JS memory anymore.
    const { data } = await axios.post(
      `${apiClient.defaults.baseURL}/auth/refresh`,
      {},
      { withCredentials: true }
    );
    const store = useAuthStore.getState();
    store.setAuth(data.user, data.accessToken);
  } catch (err) {
    // Retry once after a short delay: in multi-tab scenarios a concurrent
    // refresh from another tab may have just rotated the token, so by the
    // time we retry the browser cookie is already fresh and succeeds.
    // Only genuine session expiry (or a second failure) leads to logout.
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400));
      return doRefresh(2);
    }
    throw err;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Deduplicate concurrent refresh requests
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
        }
        await refreshPromise;

        // Retry original request with new token（cookie 已由 refresh 端点刷新，
        // 重试时无需显式注入；保留 Bearer 兜底兼容）
        const { accessToken } = useAuthStore.getState();
        if (accessToken) originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch {
        // Clear auth state before redirecting to break the redirect loop.
        // Fire-and-forget logout so the server also clears the httpOnly
        // refresh cookie.
        if (typeof window !== 'undefined') {
          fetch(`${apiClient.defaults.baseURL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
          useAuthStore.getState().clearAuth();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
