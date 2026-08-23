'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type AppNotification } from '@/lib/api-client';
import { useRealtime } from '@/hooks/use-realtime';
import { useTranslations } from 'next-intl';
import { Bell, AtSign, UserPlus, RefreshCw, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const countQuery = useQuery({
    queryKey: ['notifications-count', workspaceId],
    queryFn: () => notificationsApi.count(workspaceId!).then((r) => r.data.count),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const listQuery = useQuery({
    queryKey: ['notifications', workspaceId],
    queryFn: () => notificationsApi.list(workspaceId!, { pageSize: 20 }).then((r) => r.data),
    enabled: !!workspaceId && open,
  });

  // WS 实时：新通知 → 刷新角标
  useRealtime(workspaceId, {
    onNotification: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-count', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', workspaceId] });
    },
  });

  // 点击外部关闭
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = countQuery.data ?? 0;

  const openItem = (n: AppNotification) => {
    if (!n.read) {
      notificationsApi.markRead(workspaceId!, n.id).then(() => {
        queryClient.invalidateQueries({ queryKey: ['notifications-count', workspaceId] });
        queryClient.invalidateQueries({ queryKey: ['notifications', workspaceId] });
      });
    }
    setOpen(false);
    router.push(`/${n.entityType.toLowerCase()}/${n.entityId}`);
  };

  const markAll = () => {
    notificationsApi.markAllRead(workspaceId!).then(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications-count', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['notifications', workspaceId] });
    });
  };

  const items = listQuery.data?.items ?? [];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        title={t('title')}
      >
        <Bell className="h-4 w-4" />
        <span className="flex-1 text-left">{t('title')}</span>
        {unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-lg border border-border bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">{t('title')}</span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t('markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    'block w-full border-b border-border/50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/60',
                    !n.read && 'bg-blue-50/50',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {n.type === 'MENTION' ? (
                      <AtSign className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                    ) : n.type === 'STATUS_CHANGED' ? (
                      <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                    ) : (
                      <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-foreground">
                        {n.type === 'STATUS_CHANGED' ? (
                          <b className="text-primary">{n.entityTitle || n.entityId.slice(0, 8)}</b>
                        ) : (
                          <>
                            <b>{n.actor?.name || n.actor?.email || '同事'}</b>{' '}
                            {n.type === 'MENTION' ? t('mentionedYou') : t('assignedYou')}{' '}
                            <b className="text-primary">{n.entityTitle || n.entityId.slice(0, 8)}</b>
                          </>
                        )}
                      </p>
                      {n.snippet && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.snippet}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
