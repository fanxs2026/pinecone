'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { releaseApi, testCaseApi, ciApi, type Release } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, ArrowLeft, Calendar, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/date-utils';
import { useTranslations } from 'next-intl';
import ReleaseTestProgress from '@/components/release-test-progress';
import { TestPlanSection } from '@/components/test-plan-section';
import { OkrTracePanel } from '@/components/okr-trace-panel';
import { ShareButton } from '@/components/share-button';

const statusStyle: Record<string, string> = {
  PLANNING: 'bg-blue-100 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  CLOSED: 'bg-gray-100 text-gray-500 border-gray-200',
};

const nextStatus: Record<string, string[]> = {
  PLANNING: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['CLOSED'],
  CLOSED: [],
};

interface ReleaseDetail extends Release {
  features?: {
    id: string;
    title: string;
    code?: string;
    status: string;
    priority: string;
    _count?: { stories: number };
  }[];
}

export default function ReleaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const id = params?.id as string;
  const t = useTranslations('release');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const td = useTranslations('detail');

  const [editField, setEditField] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  const statusLabelMap: Record<string, string> = {
    PLANNING: t('planning'),
    IN_PROGRESS: t('inProgress'),
    CLOSED: t('closed'),
  };

  const { data: release, isLoading } = useQuery({
    queryKey: ['release', workspaceId, id],
    queryFn: () => releaseApi.get(workspaceId!, id).then((r) => r.data as ReleaseDetail),
    enabled: !!workspaceId && !!id,
  });

  // I6 CI 门禁 + 流水线（2026-08-18 P1）
  const { data: gate } = useQuery({
    queryKey: ['ci-gate', workspaceId, id],
    queryFn: () => ciApi.gateStatus(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });
  const { data: builds = [] } = useQuery({
    queryKey: ['ci-builds', workspaceId, id],
    queryFn: () => ciApi.builds(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Release>) =>
      releaseApi.update(workspaceId!, id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['releases', workspaceId] });
      setEditField(null);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      // Phase 1 回归闭环软校验：关闭发布周期时，若存在 FAIL/BLOCKED 用例，
      // 弹确认框警告（允许强制关闭，不做硬 gate）
      if (status === 'CLOSED' && release?.status !== 'CLOSED' && workspaceId) {
        const res = await testCaseApi.list(workspaceId, { releaseId: id }).catch(() => null);
        const blockers = (res?.data.items ?? []).filter((tc) => {
          const s = tc.testRuns?.[0]?.status;
          return s === 'FAIL' || s === 'BLOCKED';
        });
        if (blockers.length > 0) {
          const confirmed = window.confirm(
            `该发布周期还有 ${blockers.length} 个测试用例未通过（FAIL/BLOCKED）\n\n确定要强制关闭吗？`,
          );
          if (!confirmed) return null;
        }
      }
      return releaseApi.updateStatus(workspaceId!, id, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['release', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['releases', workspaceId] });
    },
  });

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
        <p className="mb-6 text-muted-foreground">{t('noWorkspaceHint')}</p>
        <Button onClick={() => router.push('/')}>{c('goCreateHome')}</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!release) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <Package className="h-12 w-12" />
        <p>{t('noRelease')}</p>
      </div>
    );
  }

  const isClosed = release.status === 'CLOSED';
  const features = release.features ?? [];

  const startEdit = (field: string) => {
    const val = (release as any)[field];
    setEditVal(val ?? '');
    setEditField(field);
  };

  const saveEdit = () => {
    if (!editField) return;
    const current = (release as any)[editField];
    if (editVal !== (current ?? '')) {
      const data: any = { [editField]: editVal || undefined };
      if (editField === 'totalCapacity') {
        data.totalCapacity = editVal ? parseInt(editVal, 10) : null;
      }
      updateMutation.mutate(data);
    } else {
      setEditField(null);
    }
  };

  const dateFields: { key: string; label: string }[] = [
    { key: 'startDate', label: t('startDate') },
    { key: 'endDate', label: t('endDate') },
    { key: 'stageDate', label: t('stageDate') },
    { key: 'productionDate', label: t('prodDate') },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => router.push('/releases')}>
          <ArrowLeft className="mr-1 h-4 w-4" />{c('back')}
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{release.name}</h1>
          {release.version && (
            <Badge variant="outline" className="font-mono text-xs">v{release.version}</Badge>
          )}
          {/* Status badge with transition dropdown */}
          {nextStatus[release.status]?.length > 0 ? (
            <div className="relative group">
              <Badge variant="outline" className={cn('cursor-pointer pr-1', statusStyle[release.status])}>
                {statusLabelMap[release.status]}
              </Badge>
              <div className="absolute left-0 top-full z-50 mt-1 hidden group-hover:block min-w-[100px]">
                <div className="rounded-md border bg-popover p-1 shadow-md">
                  {nextStatus[release.status].map((targetStatus) => (
                    <button
                      key={targetStatus}
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent whitespace-nowrap"
                      onClick={() => updateStatusMutation.mutate(targetStatus)}
                    >
                      → {statusLabelMap[targetStatus]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Badge variant="outline" className={statusStyle[release.status]}>
              {statusLabelMap[release.status]}
            </Badge>
          )}
          <ShareButton workspaceId={workspaceId!} entityType="RELEASE" entityId={id} defaultTitle={release.name} />
        </div>
        <OkrTracePanel entityType="RELEASE" entityId={id} />
        <div className="text-muted-foreground text-sm mt-1">
          {release.description || td('noDescription')}
        </div>
      </div>

      {/* Details Card */}
      <Card>
        <CardContent className="divide-y">
          {/* Name */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{t('name')}</span>
            {editField === 'name' ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(null); }} />
                <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Check className="h-3 w-3 mr-1" />{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditField(null)}><X className="h-3 w-3 mr-1" />{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm font-medium">{release.name}</span>
                {!isClosed && <Button variant="ghost" size="sm" onClick={() => startEdit('name')}>{c('edit')}</Button>}
              </div>
            )}
          </div>

          {/* Version */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{t('version')}</span>
            {editField === 'version' ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(null); }} />
                <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Check className="h-3 w-3 mr-1" />{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditField(null)}><X className="h-3 w-3 mr-1" />{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm font-mono">{release.version || '-'}</span>
                {!isClosed && <Button variant="ghost" size="sm" onClick={() => startEdit('version')}>{c('edit')}</Button>}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{c('description')}</span>
            {editField === 'description' ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea value={editVal} onChange={(e) => setEditVal(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" autoFocus
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditField(null); }} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Check className="h-3 w-3 mr-1" />{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditField(null)}><X className="h-3 w-3 mr-1" />{c('cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm text-muted-foreground whitespace-pre-wrap">{release.description || td('noDescription')}</span>
                {!isClosed && <Button variant="ghost" size="sm" onClick={() => startEdit('description')}>{c('edit')}</Button>}
              </div>
            )}
          </div>

          {/* Dates */}
          {dateFields.map(({ key, label }) => (
            <div className="flex items-start gap-3 py-3" key={key}>
              <span className="w-24 shrink-0 text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />{label}
              </span>
              {editField === key ? (
                <div className="flex flex-1 items-center gap-2">
                  <Input type="date" value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(null); }} />
                  <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Check className="h-3 w-3 mr-1" />{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditField(null)}><X className="h-3 w-3 mr-1" />{c('cancel')}</Button>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-between">
                  <span className="text-sm">{release[key as keyof Release] ? formatDate(release[key as keyof Release] as string) : '-'}</span>
                  {!isClosed && <Button variant="ghost" size="sm" onClick={() => { setEditVal((release[key as keyof Release] as string)?.split('T')[0] || ''); setEditField(key); }}>{c('edit')}</Button>}
                </div>
              )}
            </div>
          ))}

          {/* Total Capacity */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-24 shrink-0 text-sm text-muted-foreground">{t('totalCapacity')}</span>
            {editField === 'totalCapacity' ? (
              <div className="flex flex-1 items-center gap-2">
                <Input type="number" min="0" value={editVal} onChange={(e) => setEditVal(e.target.value)} autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(null); }} />
                <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}><Check className="h-3 w-3 mr-1" />{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditField(null)}><X className="h-3 w-3 mr-1" />{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm">{release.totalCapacity != null ? `${release.totalCapacity} ${t('personDay')}` : '-'}</span>
                {!isClosed && <Button variant="ghost" size="sm" onClick={() => startEdit('totalCapacity')}>{c('edit')}</Button>}
              </div>
            )}
          </div>

          {/* Created info */}
          <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <span className="w-24 shrink-0">{td('created')}</span>
            <span>{formatDateTime(release.createdAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* I6 CI 门禁 + 流水线（2026-08-18 P1） */}
      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('ciBuilds')}</span>
              {gate?.latest && (
                <Badge
                  variant="outline"
                  className={
                    gate.latest.status === 'SUCCESS'
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : ['FAILURE', 'UNSTABLE'].includes(gate.latest.status)
                        ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-gray-300 bg-gray-100 text-gray-500'
                  }
                >
                  {gate.latest.status}
                </Badge>
              )}
              {gate?.blocked && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
                  {t('ciGateBlocked')}
                </span>
              )}
            </div>
            {gate && !gate.gateEnabled && (
              <span className="text-xs text-muted-foreground">{t('ciGateHint')}</span>
            )}
          </div>

          {builds.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">{t('ciEmpty')}</p>
          ) : (
            <div className="space-y-1.5">
              {builds.slice(0, 10).map((b) => (
                <div key={b.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs">
                  <span
                    className={
                      b.status === 'SUCCESS'
                        ? 'h-2 w-2 shrink-0 rounded-full bg-green-500'
                        : ['FAILURE', 'UNSTABLE'].includes(b.status)
                          ? 'h-2 w-2 shrink-0 rounded-full bg-red-500'
                          : 'h-2 w-2 shrink-0 rounded-full bg-gray-400'
                    }
                  />
                  <span className="font-medium">{b.name}</span>
                  {b.configName && <span className="text-muted-foreground">· {b.configName}</span>}
                  {b.branch && <span className="font-mono text-muted-foreground">@{b.branch}</span>}
                  {b.commit && <span className="font-mono text-muted-foreground">{b.commit.slice(0, 7)}</span>}
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {b.finishedAt ? formatDateTime(b.finishedAt) : b.createdAt ? formatDateTime(b.createdAt) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Features list */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          {t('featureCount', { count: features.length })}
        </h2>
        {features.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {c('noData')}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {features.map((feature) => (
              <Card key={feature.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    {feature.code && (
                      <Badge variant="outline" className="font-mono text-xs">{feature.code}</Badge>
                    )}
                    <Link href={`/features/${feature.id}`} className="text-sm font-medium text-primary hover:underline">
                      {feature.title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{tStatus(`FEATURE_${feature.status}`) || feature.status}</span>
                    <span>{t('storyCountLabel', { count: feature._count?.stories ?? 0 })}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Phase 1: 测试进度 */}
      {workspaceId && (
        <ReleaseTestProgress workspaceId={workspaceId} releaseId={id} disabled={isClosed} />
      )}

      {/* Phase 4: 测试计划（命名计划批次 + 进度汇总） */}
      {workspaceId && (
        <Card>
          <CardContent className="py-4">
            <TestPlanSection workspaceId={workspaceId} releaseId={id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
