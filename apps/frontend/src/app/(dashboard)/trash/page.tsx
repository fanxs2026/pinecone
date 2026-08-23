'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { trashApi, type TrashBundle, type TrashItem } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/date-utils';
import { showToast } from '@/components/simple-toast';
import { Input } from '@/components/ui/input';

const TYPE_META: { key: keyof TrashBundle; label: string; color: string }[] = [
  { key: 'ideas', label: '创意', color: 'bg-purple-100 text-purple-700' },
  { key: 'features', label: '功能', color: 'bg-blue-100 text-blue-700' },
  { key: 'stories', label: '任务', color: 'bg-teal-100 text-teal-700' },
  { key: 'supports', label: '缺陷/支持', color: 'bg-red-100 text-red-700' },
  { key: 'testCases', label: '测试用例', color: 'bg-orange-100 text-orange-700' },
];

const TYPE_KEY_MAP: Record<string, string> = {
  ideas: 'IDEA', features: 'FEATURE', stories: 'STORY', supports: 'SUPPORT', testCases: 'TEST_CASE',
};

export default function TrashPage() {
  const t = useTranslations('trash');
  const c = useTranslations('common');
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);
  // 2026-08-14：自动清理开关 + 多选清理状态（key → 勾选的 id 集合）
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['trash', workspaceId],
    queryFn: () => trashApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: settings } = useQuery({
    queryKey: ['trash-settings', workspaceId],
    queryFn: () => trashApi.settings(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const restoreMutation = useMutation({
    mutationFn: ({ type, item }: { type: string; item: TrashItem }) =>
      trashApi.restore(workspaceId!, type, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['ideas', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['features', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['supports', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['test-cases', workspaceId] });
      setRestoring(null);
    },
    onError: () => setRestoring(null),
  });

  // 2026-08-14：手动清理（多选，物理删除不可恢复）
  const purgeMutation = useMutation({
    mutationFn: ({ key, ids }: { key: string; ids: string[] }) =>
      trashApi.purge(workspaceId!, TYPE_KEY_MAP[key], ids),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['trash', workspaceId] });
      setSelected((s) => {
        const next = { ...s };
        delete next[vars.key];
        return next;
      });
      setPurging(null);
      showToast(t('purgeSuccess', { count: res.data?.purged ?? 0 }));
    },
    onError: (e: any) => {
      setPurging(null);
      showToast(e?.response?.data?.message || c('error'));
    },
  });

  // 2026-08-14：自动清理开关 + 保留天数（可配置）
  const [daysInput, setDaysInput] = useState<string | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);

  const saveSettings = (data: { purgeEnabled?: boolean; purgeDays?: number }) => {
    if (updatingSettings) return;
    setUpdatingSettings(true);
    trashApi.updateSettings(workspaceId!, data)
      .then((r) => {
        queryClient.setQueryData(['trash-settings', workspaceId], r.data);
        setDaysInput(null);
        if (data.purgeDays) showToast(t('daysSaved', { days: data.purgeDays }));
      })
      .catch(() => showToast(c('error')))
      .finally(() => setUpdatingSettings(false));
  };

  // 2026-08-14：自动清理开关
  const toggleSettings = () => {
    if (!settings) return;
    saveSettings({ purgeEnabled: !settings.purgeEnabled });
  };

  const toggleItem = (key: string, id: string) => {
    setSelected((s) => {
      const set = new Set(s[key] ?? []);
      if (set.has(id)) set.delete(id); else set.add(id);
      return { ...s, [key]: set };
    });
  };

  const toggleAll = (key: string, items: TrashItem[]) => {
    setSelected((s) => {
      const cur = s[key] ?? new Set<string>();
      const allChecked = items.length > 0 && items.every((i) => cur.has(i.id));
      const next = new Set<string>();
      if (!allChecked) items.forEach((i) => next.add(i.id));
      return { ...s, [key]: next };
    });
  };

  const confirmPurge = (key: string, items: TrashItem[]) => {
    const ids = Array.from(selected[key] ?? []);
    if (ids.length === 0) return;
    if (!window.confirm(t('purgeConfirm', { count: ids.length }))) return;
    setPurging(key);
    purgeMutation.mutate({ key, ids });
  };

  const total = data ? Object.values(data).reduce((n, arr) => n + arr.length, 0) : 0;

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Archive className="mb-4 h-12 w-12 text-muted-foreground" />
        <p>{c('noWorkspaceYet')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <Badge variant="outline">{t('count', { count: total })}</Badge>
      </div>

      {/* 2026-08-14：自动清理开关 + 保留天数 */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('autoPurge')}</p>
            <p className="text-xs text-muted-foreground">
              {settings?.purgeEnabled
                ? t('autoPurgeHintOn', { days: settings.purgeDays ?? 180 })
                : t('autoPurgeHintOff')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* 保留天数设置 */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t('retentionDays')}</span>
              <Input
                type="number"
                min={1}
                max={3650}
                className="h-8 w-24"
                value={daysInput ?? settings?.purgeDays ?? 180}
                onChange={(e) => setDaysInput(e.target.value)}
                onBlur={() => {
                  if (daysInput !== null) {
                    const v = Math.min(3650, Math.max(1, Math.round(Number(daysInput) || 180)));
                    if (v !== settings?.purgeDays) saveSettings({ purgeDays: v });
                    else setDaysInput(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
            <button
              type="button"
              onClick={toggleSettings}
              disabled={updatingSettings || !settings}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${settings?.purgeEnabled ? 'bg-blue-500' : 'bg-gray-300'}`}
              aria-pressed={settings?.purgeEnabled}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${settings?.purgeEnabled ? 'left-[22px]' : 'left-0.5'}`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : total === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{t('empty')}</CardContent></Card>
      ) : (
        TYPE_META.map(({ key, label, color }) => {
          const items = data?.[key] ?? [];
          if (items.length === 0) return null;
          const sel = selected[key] ?? new Set<string>();
          const allChecked = items.every((i) => sel.has(i.id));
          return (
            <div key={key}>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary" className={color}>{label}</Badge>
                <span className="text-xs text-muted-foreground">{items.length}</span>
                {/* 全选 */}
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => toggleAll(key, items)}
                    className="h-3.5 w-3.5 accent-blue-500"
                  />
                  {t('selectAll')}
                </label>
                {/* 清理所选 */}
                <Button
                  size="sm"
                  variant="destructive"
                  className="ml-auto"
                  disabled={sel.size === 0 || purging === key}
                  onClick={() => confirmPurge(key, items)}
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  {t('purgeSelected', { count: sel.size })}
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <Card key={item.id} className={sel.has(item.id) ? 'border-blue-300 bg-blue-50/30' : ''}>
                    <CardContent className="flex items-center justify-between py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sel.has(item.id)}
                          onChange={() => toggleItem(key, item.id)}
                          className="h-3.5 w-3.5 shrink-0 accent-blue-500"
                        />
                        {item.code && <Badge variant="outline" className="shrink-0 font-mono text-xs">{item.code}</Badge>}
                        <span className="truncate text-sm">{item.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-muted-foreground">{formatDateTime(item.deletedAt)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={restoring === `${key}:${item.id}`}
                          onClick={() => { setRestoring(`${key}:${item.id}`); restoreMutation.mutate({ type: TYPE_KEY_MAP[key], item }); }}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />{t('restore')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
