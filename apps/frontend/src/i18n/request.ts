import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import zh from '../messages/zh.json';
import en from '../messages/en.json';

const messagesMap = { zh, en } as const;

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as never)) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (messagesMap as Record<string, typeof zh>)[locale] ?? zh,
  };
});
