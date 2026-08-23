'use client';

import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * 极简语言切换器：写入 NEXT_LOCALE cookie 后刷新页面。
 * 放在共享外壳（dashboard 侧边栏底部 / kb 顶栏右侧）即可全局生效。
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();

  const switchTo = (next: string) => {
    if (next === locale) return;
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <div className={cn('flex items-center gap-1 text-sm select-none', className)}>
      <button
        type="button"
        onClick={() => switchTo('zh')}
        className={cn(
          'rounded px-1.5 py-0.5 transition-colors hover:bg-accent',
          locale === 'zh' ? 'font-bold text-primary' : 'text-muted-foreground',
        )}
        aria-pressed={locale === 'zh'}
      >
        中文
      </button>
      <span className="text-muted-foreground">|</span>
      <button
        type="button"
        onClick={() => switchTo('en')}
        className={cn(
          'rounded px-1.5 py-0.5 transition-colors hover:bg-accent',
          locale === 'en' ? 'font-bold text-primary' : 'text-muted-foreground',
        )}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  );
}
