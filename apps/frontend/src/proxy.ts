import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const publicPaths = ['/login', '/register'];
const protectedPaths = ['/', '/ideas', '/features', '/releases', '/stories', '/supports', '/time-tracking', '/kb', '/themes', '/feedback-portal', '/reports', '/dashboards'];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // 与后端 auth.controller 的 ACCESS_COOKIE 保持一致（'pinecone-access'）——
  // 曾误写 'pinecone-auth'（不存在）导致受保护页面永远跳登录
  const authCookie = request.cookies.get('pinecone-access');

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (authCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    const res = NextResponse.next();
    if (!request.cookies.get('NEXT_LOCALE')) {
      res.cookies.set('NEXT_LOCALE', routing.defaultLocale, { path: '/' });
    }
    return res;
  }

  if (protectedPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    if (!authCookie) {
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
