'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import apiClient from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/date-utils';
import { Activity, MonitorSmartphone, RefreshCw, RadioTower, ShieldAlert } from 'lucide-react';

interface Heartbeat {
  id: string;
  instanceId: string;
  version: string | null;
  edition: string;
  lastSeenAt: string;
  checkCount: number;
  createdAt: string;
}

interface InstancesResp {
  items: Heartbeat[];
  total: number;
  active30d: number;
  active7d: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 50;

/**
 * 活跃实例（平台管理端）
 *
 * 数据源：GET /api/telemetry/instances（仅系统管理员）。
 * 实例在启动/每日更新检查时上报心跳，这里展示版本、活跃度与检查次数。
 */
export default function AdminInstancesPage() {
  const t = useTranslations('instances');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error, refetch } = useQuery<InstancesResp>({
    queryKey: ['admin-instances', page],
    queryFn: () =>
      apiClient
        .get('/telemetry/instances', { params: { page, pageSize: PAGE_SIZE } })
        .then((r) => r.data),
    retry: false,
  });

  const statusOf = (lastSeenAt: string): 'active' | 'idle' | 'silent' => {
    const days = (Date.now() - new Date(lastSeenAt).getTime()) / 86400000;
    if (days <= 7) return 'active';
    if (days <= 30) return 'idle';
    return 'silent';
  };

  const statusStyle: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    idle: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    silent: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
  };

  const httpStatus = (error as any)?.response?.status;
  if (httpStatus === 403) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-medium">{t('forbidden')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('forbiddenDesc')}</p>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('desc')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={'mr-1 h-4 w-4' + (isFetching ? ' animate-spin' : '')} />
          {t('refresh')}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: t('totalInstances'), value: data?.total, icon: MonitorSmartphone },
          { label: t('active7d'), value: data?.active7d, icon: Activity },
          { label: t('active30d'), value: data?.active30d, icon: RadioTower },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <s.icon className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {isLoading ? '—' : (s.value ?? 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {(error as any)?.message || 'Failed to load instances'}
            </p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">{t('colInstance')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colVersion')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colEdition')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colLastSeen')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colChecks')}</th>
                  <th className="py-2 pr-4 font-medium">{t('firstSeen')}</th>
                  <th className="py-2 font-medium">{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const st = statusOf(it.lastSeenAt);
                  return (
                    <tr key={it.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="py-2.5 pr-4 font-mono text-xs" title={it.instanceId}>
                        {it.instanceId.slice(0, 8)}…
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">{it.version || '—'}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant="outline"
                          className={
                            it.edition === 'ENTERPRISE'
                              ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300'
                              : ''
                          }
                        >
                          {it.edition}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">{formatDateTime(it.lastSeenAt)}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{it.checkCount}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(it.createdAt)}
                      </td>
                      <td className="py-2.5">
                        <span className={'rounded px-2 py-0.5 text-xs ' + statusStyle[st]}>
                          {t(st)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {data && data.total > data.pageSize && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t('page', { page: data.page, total: totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ←
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
