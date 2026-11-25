import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { PwaRegister } from '@/components/pwa-register';
import { NextIntlClientProvider } from 'next-intl';
import { cookies } from 'next/headers';
import zhMessages from '@/messages/zh.json';
import enMessages from '@/messages/en.json';

const inter = Inter({ subsets: ['latin'] });

const messagesMap = { zh: zhMessages, en: enMessages } as const;

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'zh';
  return {
    title: 'Pinecone',
    description:
      locale === 'zh'
        ? 'Aha! 风格的需求与发布周期管理平台'
        : 'Aha!-style requirements and release cycle management platform',
    // Phase 3-① PWA
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: 'Pinecone', statusBarStyle: 'default' },
    icons: { icon: '/pinecone-logo.jpg', apple: '/pinecone-logo.jpg' },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = cookieStore.get('NEXT_LOCALE')?.value || 'zh';
  const validLocale = locale === 'en' ? 'en' : 'zh';
  const messages = messagesMap[validLocale];

  return (
    <html lang={validLocale === 'zh' ? 'zh-CN' : 'en'} suppressHydrationWarning>
      <body className={inter.className}>
        {/* 运行期配置：便携版启动时由 bin/run-frontend.js 依 .env 生成，
            必须在任何应用代码之前执行，故用 beforeInteractive。 */}
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        <PwaRegister />
        <NextIntlClientProvider locale={validLocale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
