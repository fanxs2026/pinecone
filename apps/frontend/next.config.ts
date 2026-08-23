import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// 恢复插件：src/i18n/request.ts（getRequestConfig）是 server-side 翻译的注册点，
// 移除插件会报 "Couldn't find next-intl config file"（2026-08-07 实测）。
// layout.tsx 手动加载仅用于客户端 Provider；server 端翻译仍需插件指向 request.ts。
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  transpilePackages: ['lucide-react'],
  // 生产瘦身：standalone 输出最小 server + traced node_modules（docker/frontend.Dockerfile prod 层只拷该目录）
  output: 'standalone',
  // P2-18 修复：基础安全响应头（OWASP Secure Headers）
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
