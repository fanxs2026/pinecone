'use client';

import { useEffect } from 'react';

/**
 * Phase 3-① PWA：注册 Service Worker（生产模式注册，便于离线）。
 * 2026-08-15 修复：dev 模式不再注册——SW 会拦截页面/资源请求并缓存 HTML，
 * 与 Next.js dev 热更新/编译产物冲突，曾导致页面被 SW 接管后异常刷新循环；
 * 并主动注销历史注册过的 SW（切换 dev/prod 后旧 SW 会残留接管页面）。
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const isProd = process.env.NODE_ENV === 'production';

    if (!isProd) {
      // 非生产：注销历史 SW，避免残留拦截 dev 流量
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => { /* 静默：SW 不可用不影响应用 */ });
    };
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);
  return null;
}
