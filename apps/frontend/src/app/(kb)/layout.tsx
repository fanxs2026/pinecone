'use client';

import { useState, useRef, useEffect } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BookOpen, Search, Home, FileText } from 'lucide-react';
import { kbSearchApi } from '@/lib/api-client';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function KbLayout({ children }: { children: React.ReactNode }) {
  const { workspace, workspaceId, isLoading } = useWorkspace();
  const router = useRouter();
  const t = useTranslations('kb');
  const tStatus = useTranslations('status');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim() || !workspaceId) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await kbSearchApi.search(workspaceId!, value);
        const results = Array.isArray(res.data) ? res.data : [];
        setSearchResults(results);
        setShowResults(results.length > 0);
      } catch {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);
  };

  const goToPage = (pageId: string, spaceId?: string) => {
    setShowResults(false);
    setSearchQuery('');
    router.push(`/kb/${spaceId || ''}/${pageId}`);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('loading')}</p>
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{t('noWorkspace')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-card px-6">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <span className="text-lg font-bold">{`${workspace.name} — ${t('titleSuffix')}`}</span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <div className="relative hidden w-72 md:block" ref={searchRef}>
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder={t('searchPlaceholder')}
              className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            {showResults && (
              <div className="absolute right-0 top-full z-[100] mt-1 w-full overflow-hidden rounded-lg border border-border bg-white p-1 shadow-2xl">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">{t('noMatch')}</p>
                ) : (
                  searchResults.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => goToPage(page.id, page.spaceId || undefined)}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{page.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {page.status === 'draft' ? tStatus('KB_DRAFT') : page.status === 'published' ? tStatus('KB_PUBLISHED') : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <LanguageSwitcher className="mr-1" />
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <Home className="h-4 w-4" />
            {t('backHome')}
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
