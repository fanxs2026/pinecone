'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntryApi } from '@/lib/api-client';
import { formatDate } from '@/lib/date-utils';
import { toHoursNumber } from '@/lib/number-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';

interface TimeEntryListProps {
  workspaceId: string;
  /** story 绑定模式（与 entityType/entityId 二选一） */
  storyId?: string;
  /** entity 绑定模式（与 storyId 二选一），如 IDEA / FEATURE / SUPPORT */
  entityType?: string;
  entityId?: string;
  /** 可选：估算工时，传入后展示「已记录 / 估算」对比 */
  estimatedHours?: number | string | null;
  /**
   * 2026-08-14：总工时覆盖值（含子任务工时的汇总，来自 story.loggedHours）。
   * 传入后顶部「已记录」显示该值（story 自身 + 全部子任务），并注明含子任务；
   * 明细列表仍只显示 story 自身的 entries。
   */
  totalHoursOverride?: number | null;
}

export default function TimeEntryList({
  workspaceId,
  storyId,
  entityType,
  entityId,
  estimatedHours,
  totalHoursOverride,
}: TimeEntryListProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('timeTracking');
  const c = useTranslations('common');
  const td = useTranslations('detail');
  const user = useAuthStore((s) => s.user);

  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [billable, setBillable] = useState(true);

  const queryKey = ['time-entries', workspaceId, storyId ?? `${entityType}:${entityId}`];

  const { data } = useQuery({
    queryKey,
    queryFn: () =>
      timeEntryApi
        .list(workspaceId!, {
          storyId: storyId || undefined,
          entityType: storyId ? undefined : entityType,
          entityId: storyId ? undefined : entityId,
        })
        .then((r) => r.data),
    enabled: !!workspaceId,
  });
  const entries = data?.items ?? [];
  const totalHours = entries.reduce((sum, e) => sum + toHoursNumber(e.hours), 0);

  const createMutation = useMutation({
    mutationFn: () =>
      timeEntryApi
        .create(workspaceId!, {
          storyId: storyId || undefined,
          entityType: storyId ? undefined : entityType,
          entityId: storyId ? undefined : entityId,
          description,
          hours: parseFloat(hours),
          date,
          billable,
        })
        .then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDescription('');
      setHours('');
      setDate(new Date().toISOString().slice(0, 10));
      setBillable(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) => timeEntryApi.remove(workspaceId!, entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const estimate = estimatedHours == null ? null : toHoursNumber(estimatedHours);
  const showEstimate = estimate != null && estimate > 0;
  // 2026-08-14：传入 totalHoursOverride（story.loggedHours 含子任务）时，顶部总数显示汇总值
  const displayTotal = totalHoursOverride != null ? toHoursNumber(totalHoursOverride) : totalHours;
  const diff = showEstimate ? displayTotal - estimate! : 0;
  const over = diff > 0.05;

  return (
    <div className="space-y-4">
      {/* Summary: total hours + estimate comparison */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {totalHoursOverride != null ? t('totalWithSubtasks') : t('totalHours')}
            </span>
            <span className="text-lg font-bold">{displayTotal.toFixed(1)}</span>
            <span className="text-sm text-muted-foreground">{td('hours')}</span>
          </div>
          {showEstimate && (
            <div
              className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                over
                  ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <span>
                {t('estimate')}: {estimate!.toFixed(1)}
                {td('hours')}
              </span>
              <span className="opacity-50">·</span>
              <span className={over ? 'font-medium' : ''}>
                {over ? t('overEstimate') : t('withinEstimate')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add time entry */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{c('description')}</label>
          <Input
            size={24}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('workDescription')}
            className="h-8 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{td('hoursLabel')}</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="h-8 w-16 rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{td('dateLabel')}</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            className="h-4 w-4"
          />
          {t('billable')}
        </label>
        <Button
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={!hours || createMutation.isPending}
        >
          <Plus className="mr-1 h-3 w-3" /> {c('add')}
        </Button>
      </div>

      {/* Entries table */}
      {entries.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{c('description')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{td('hoursLabel')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{td('dateLabel')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{td('user')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">{t('billable')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{entry.description}</td>
                  <td className="px-3 py-2">{toHoursNumber(entry.hours).toFixed(1)}h</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(entry.date)}</td>
                  <td className="px-3 py-2">{entry.user?.name || entry.user?.email || '-'}</td>
                  <td className="px-3 py-2">
                    {entry.billable ? (
                      <Badge variant="secondary" className="bg-green-100 text-xs text-green-700 dark:bg-green-950/60 dark:text-green-300">
                        {c('yes')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {c('no')}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {entry.userId === user?.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteMutation.mutate(entry.id)}
                        title={c('delete')}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <Clock className="h-8 w-8" />
          <p className="text-sm">{t('noEntries')}</p>
        </div>
      )}
    </div>
  );
}
