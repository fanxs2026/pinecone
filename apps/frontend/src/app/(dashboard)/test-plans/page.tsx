'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testPlanApi, releaseApi } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/simple-toast';
import { Plus, Loader2, Play, Trash2, ClipboardCheck } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
};

export default function TestPlansPage() {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const t = useTranslations('testPlans');
  const c = useTranslations('common');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [description, setDescription] = useState('');
  const [runPlanId, setRunPlanId] = useState<string | null>(null);
  const [runReleaseId, setRunReleaseId] = useState('');

  const { data: plans, isLoading } = useQuery({
    queryKey: ['test-plans', workspaceId],
    queryFn: () => testPlanApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      testPlanApi.create(workspaceId!, { name, releaseId: releaseId || undefined, description: description || undefined }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-plans', workspaceId] });
      setShowCreate(false);
      setName('');
      setReleaseId('');
      setDescription('');
      showToast(t('created'));
    },
    onError: (e: any) => showToast(typeof e?.response?.data?.message === 'string' ? e.response.data.message : t('error')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => testPlanApi.remove(workspaceId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-plans', workspaceId] });
      showToast(t('removed'));
    },
  });

  const startRunMutation = useMutation({
    mutationFn: ({ planId, relId }: { planId: string; relId: string }) => testPlanApi.startRun(workspaceId!, planId, relId).then((r) => r.data),
    onSuccess: (data: any, vars) => {
      queryClient.invalidateQueries({ queryKey: ['test-plans', workspaceId] });
      setRunPlanId(null);
      setRunReleaseId('');
      showToast(`${t('runStarted')} (${data.total} cases)`);
      // 进入走查
      window.location.href = `/test-plans/${vars.planId}/walkthrough`;
    },
    onError: (e: any) => showToast(typeof e?.response?.data?.message === 'string' ? e.response.data.message : t('error')),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" /> {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? c('cancel') : (<><Plus className="mr-1 h-4 w-4" /> {t('newPlan')}</>)}
        </Button>
      </div>

      {/* 新建 */}
      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Input placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder={t('descPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex items-center gap-2">
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={releaseId}
                onChange={(e) => setReleaseId(e.target.value)}
              >
                <option value="">{t('noRelease')}（{t('crossRelease')}）</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>{r.version ? `${r.name} (${r.version})` : r.name}</option>
                ))}
              </select>
              <Button
                disabled={!name.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : c('save')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 列表 */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (plans ?? []).length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="space-y-2">
          {(plans ?? []).map((p) => (
            <div key={p.id} className="group flex items-center gap-3 rounded-md border border-border/60 px-4 py-3 hover:bg-muted/40">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link href={`/test-plans/${p.id}/walkthrough`} className="truncate text-sm font-medium hover:underline">
                    {p.name}
                  </Link>
                  <Badge variant="secondary" className={`text-xs ${STATUS_COLORS[p.status] || 'bg-gray-100'}`}>{p.status}</Badge>
                  {p.release ? (
                    <Badge variant="outline" className="text-xs">{p.release.version ? `${p.release.name} (${p.release.version})` : p.release.name}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-muted-foreground">{t('noRelease')}</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{p._count?.cases ?? 0} cases</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setRunPlanId(p.id); setRunReleaseId(p.releaseId ?? ''); }}
              >
                <Play className="mr-1 h-3 w-3" /> {t('startWalkthrough')}
              </Button>
              <button
                className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                onClick={() => removeMutation.mutate(p.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 启动走查弹层（选 release） */}
      {runPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setRunPlanId(null)}>
          <div className="w-96 rounded-lg border bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium">{t('selectReleaseForRun')}</h3>
            <select
              className="mt-3 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={runReleaseId}
              onChange={(e) => setRunReleaseId(e.target.value)}
            >
              <option value="">{t('noRelease')}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>{r.version ? `${r.name} (${r.version})` : r.name}</option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRunPlanId(null)}>{c('cancel')}</Button>
              <Button
                size="sm"
                disabled={!runReleaseId || startRunMutation.isPending}
                onClick={() => startRunMutation.mutate({ planId: runPlanId, relId: runReleaseId })}
              >
                {startRunMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('confirmRun')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
