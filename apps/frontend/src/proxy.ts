import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const publicPaths = ['/login', '/register'];
// 受保护路由。2026-11-26 审计补齐：原先漏了 /settings /okr /imports /trash
// /test-cases /test-plans —— 未登录能直接渲染这些页面骨架（数据由后端 401 兜住，
// 无泄露，但属于守卫不完整）。这里按 app/(dashboard) 的实际目录对齐。
const protectedPaths = [
  '/', '/ideas', '/features', '/releases', '/stories', '/supports',
  '/time-tracking', '/kb', '/themes', '/feedback-portal', '/reports', '/dashboards',
  '/settings', '/okr', '/imports', '/trash', '/test-cases', '/test-plans',
  '/admin',
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // 与后端 auth.controller 的 cookie 名保持一致（'pinecone-access'）——
  // 曾误写 'pinecone-auth'（不存在）导致受保护页面永远跳登录
  const authCookie = request.cookies.get('pinecone-access');
  // access（1h）过期后，只要 refresh（7d）还在就放行：
  // 页面加载后首个 API 会拿到 401，由 axios 拦截器用 refresh cookie 静默续期。
  // 只认 access 的话，用户挂机 1 小时再点任何页面都会被踢回登录页，
  // 7 天有效的 refresh 等于白给（2026-11-28 审计 P2）。
  const hasRefreshCookie = !!request.cookies.get('pinecone-refresh');

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    // 2026-11-26 修复（退出登录后被弹回首页、进不了登录页）：
    // 这里原本「有 pinecone-access 就 302 到 /」。一旦 cookie 因任何原因没被清掉
    // （logout 请求被 CSRF 校验拒绝 / 网络失败 / 反代改写 Host），用户就会陷入
    // 「前端已清登录态 → 去 /login → 又被弹回 / → 首页显示创建工作区」的死锁，
    // 且没有任何入口能重新登录。
    // 登录页本身不需要这层保护：已登录用户误访问 /login 只会看到表单，无副作用。
    // 因此不再自动重定向，把「要不要进应用」交给页面自身判断。
    const res = NextResponse.next();
    if (!request.cookies.get('NEXT_LOCALE')) {
      res.cookies.set('NEXT_LOCALE', routing.defaultLocale, { path: '/' });
    }
    return res;
  }

  if (protectedPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    if (!authCookie && !hasRefreshCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const res = NextResponse.next();
  if (!request.cookies.get('NEXT_LOCALE')) {
    res.cookies.set('NEXT_LOCALE', routing.defaultLocale, { path: '/' });
  }
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
