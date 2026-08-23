import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // 仅支持中文与英文，后续可扩展
  locales: ['zh', 'en'],
  defaultLocale: 'zh',
  // 不带 URL 前缀：现有 router.push / Link / window.location 全部零改动
  localePrefix: 'never',
});

export type Locale = (typeof routing.locales)[number];
