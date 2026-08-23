'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchApi, SearchResultItem } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Search, Loader2, CornerDownLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface CommandPaletteProps {
  workspaceId: string | null;
}

const typeToPath: Record<string, string> = {
  STORY: '/stories',
  IDEA: '/ideas',
  FEATURE: '/features',
  SUPPORT: '/supports',
};

export function CommandPalette({ workspaceId }: CommandPaletteProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('commandPalette');

  // Cmd+K / Ctrl+K 开关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 打开时聚焦
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQ('');
      setActiveIdx(0);
    }
  }, [open]);

  // 搜索（debounce 由 enabled + staleTime 控制）
  const { data, isFetching } = useQuery({
    queryKey: ['global-search', workspaceId, q],
    queryFn: () => searchApi.global(workspaceId!, q).then((r) => r.data),
    enabled: !!workspaceId && open && q.trim().length >= 1,
  });
  const results: SearchResultItem[] = data?.results ?? [];

  const go = (r: SearchResultItem) => {
    setOpen(false);
    setQ('');
    router.push(`${typeToPath[r.entityType]}/${r.id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[activeIdx]) go(results[activeIdx]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActiveIdx(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('placeholder')}
            className="border-0 shadow-none focus-visible:ring-0"
          />
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {q.trim().length < 1 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('hint')}</p>
          ) : isFetching && results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('searching')}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('empty')}</p>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.entityType}-${r.id}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  i === activeIdx ? 'bg-blue-50' : ''
                }`}
              >
                <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">
                  {t(`type_${r.entityType.toLowerCase()}`)}
                </span>
                {r.code && <span className="shrink-0 text-xs text-muted-foreground">{r.code}</span>}
                <span className="flex-1 truncate">{r.title}</span>
                {i === activeIdx && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span><kbd className="rounded border bg-muted px-1">↑↓</kbd> {t('navigate')}</span>
          <span><kbd className="rounded border bg-muted px-1">Enter</kbd> {t('open')}</span>
          <span><kbd className="rounded border bg-muted px-1">Esc</kbd> {t('close')}</span>
        </div>
      </div>
    </div>
  );
}
