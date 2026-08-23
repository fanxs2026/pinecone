'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { releaseApi } from '@/lib/api-client';
import { formatDate } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Package, Plus, Calendar, Pencil, X, Check, ChevronDown, GanttChart, LayoutGrid } from 'lucide-react';
import { useWorkspace } from '@/hooks/use-workspace';
import { ReleasesGantt } from '@/components/releases-gantt';
import { PortfolioTimeline } from '@/components/portfolio-timeline';
import { SprintSection } from '@/components/sprint-section';
import type { Release } from '@/lib/api-client';
import { useTranslations } from 'next-intl';

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

function EditReleaseForm({ release, onDone }: { release: Release; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const t = useTranslations('release');
  const c = useTranslations('common');
  const [name, setName] = useState(release.name);
  const [version, setVersion] = useState(release.version || '');
  const [description, setDescription] = useState(release.description || '');
  const [startDate, setStartDate] = useState(release.startDate?.split('T')[0] || '');
  const [endDate, setEndDate] = useState(release.endDate?.split('T')[0] || '');
  const [stageDate, setStageDate] = useState(release.stageDate?.split('T')[0] || '');
  const [productionDate, setProductionDate] = useState(release.productionDate?.split('T')[0] || '');
  const [totalCapacity, setTotalCapacity] = useState(release.totalCapacity?.toString() || '');

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Release>) =>
      releaseApi.update(workspaceId!, release.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['features', workspaceId] });
      onDone();
    },
  });

  const save = () => {
    updateMutation.mutate({
      name: name || release.name,
      version: version || undefined,
      description: description || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      stageDate: stageDate || undefined,
      productionDate: productionDate || undefined,
      totalCapacity: totalCapacity ? parseInt(totalCapacity, 10) : null,
    } as any);
  };

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <Input size={1} placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <Input size={1} placeholder={t('versionPlaceholder')} value={version} onChange={(e) => setVersion(e.target.value)} />
      <Input size={1} placeholder={c('description')} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><label className="text-muted-foreground">{t('start')}</label><Input type="date" size={1} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><label className="text-muted-foreground">{t('end')}</label><Input type="date" size={1} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div><label className="text-muted-foreground">Stage</label><Input type="date" size={1} value={stageDate} onChange={(e) => setStageDate(e.target.value)} /></div>
        <div><label className="text-muted-foreground">Prod</label><Input type="date" size={1} value={productionDate} onChange={(e) => setProductionDate(e.target.value)} /></div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">{t('totalCapacity')}</label>
        <Input type="number" min="0" size={1} placeholder={t('capacityPlaceholder')} value={totalCapacity} onChange={(e) => setTotalCapacity(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={updateMutation.isPending}><Check className="h-3 w-3 mr-1" />{c('save')}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}><X className="h-3 w-3 mr-1" />{c('cancel')}</Button>
      </div>
    </div>
  );
}

export default function ReleasesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [stageDate, setStageDate] = useState('');
  const [productionDate, setProductionDate] = useState('');
  const [newCapacity, setNewCapacity] = useState('');
  const [newDependsOn, setNewDependsOn] = useState(''); // G8 甘特依赖
  const [view, setView] = useState<'list' | 'gantt'>('list'); // 2026-08-09: 甘特作为发布计划视图
  const t = useTranslations('release');
  const c = useTranslations('common');

  const statusLabelMap: Record<string, string> = {
    PLANNING: t('planning'),
    IN_PROGRESS: t('inProgress'),
    CLOSED: t('closed'),
  };

  const { data: releasesData, isLoading } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const createMutation = useMutation({
    mutationFn: (data: { name: string; version?: string; startDate?: string; endDate?: string; stageDate?: string; productionDate?: string; totalCapacity?: number; dependsOnId?: string }) =>
      releaseApi.create(workspaceId!, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', workspaceId] });
      setShowCreate(false);
      setName('');
      setVersion('');
      setStartDate('');
      setEndDate('');
      setStageDate('');
      setProductionDate('');
      setNewCapacity('');
      setNewDependsOn('');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      releaseApi.updateStatus(workspaceId!, id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['releases', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['features', workspaceId] });
    },
  });

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
        <p className="mb-6 text-muted-foreground">{t('noWorkspaceHint')}</p>
        <Button onClick={() => window.location.href = '/'}>{c('goCreateHome')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 视图切换：列表 / 甘特图（2026-08-09 甘特迁入发布计划） */}
          <div className="flex items-center rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />{t('viewList')}
            </button>
            <button
              type="button"
              onClick={() => setView('gantt')}
              className={cn(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                view === 'gantt' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
              )}
            >
              <GanttChart className="h-3.5 w-3.5" />{t('viewGantt')}
            </button>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1 h-4 w-4" /> {t('newRelease')}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('newRelease')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder={t('versionPlaceholder')} value={version} onChange={(e) => setVersion(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('startDate')}</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('endDate')}</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('stageDate')}</label>
                <Input type="date" value={stageDate} onChange={(e) => setStageDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('prodDate')}</label>
                <Input type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('totalCapacity')}</label>
              <Input type="number" min="0" placeholder={t('capacityPlaceholder')} value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('dependsOn')}</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                value={newDependsOn}
                onChange={(e) => setNewDependsOn(e.target.value)}
              >
                <option value="">{t('dependsOnNone')}</option>
                {releases.map((rl) => (
                  <option key={rl.id} value={rl.id}>{rl.name}{rl.version ? ` ${rl.version}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate({
                name,
                version: version || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                stageDate: stageDate || undefined,
                productionDate: productionDate || undefined,
                totalCapacity: newCapacity ? parseInt(newCapacity, 10) : undefined,
                dependsOnId: newDependsOn || undefined,
              })} disabled={!name}>
                {c('create')}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{c('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 甘特视图（2026-08-09 迁入发布计划页） */}
      {view === 'gantt' && (
        <>
          <Card>
            <CardContent className="py-4">
              <ReleasesGantt />
            </CardContent>
          </Card>
          {/* P2-⑬ 跨发布组合时间线（Epic × Release） */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('portfolioTitle')}</CardTitle>
              <CardDescription>{t('portfolioDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="py-4">
              <PortfolioTimeline />
            </CardContent>
          </Card>
        </>
      )}

      {view === 'list' && isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : releases.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Package className="h-12 w-12" />
          <p>{t('noRelease')}</p>
        </div>
      ) : view === 'list' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {releases.map((release) => (
            <Card
              key={release.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                  <CardTitle className="text-base cursor-pointer" onClick={() => router.push(`/releases/${release.id}`)}>
                    {release.name}
                  </CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    {nextStatus[release.status].length > 0 ? (
                      <div className="relative group">
                        <Badge variant="outline" className={cn('cursor-pointer pr-1', statusStyle[release.status])}>
                          {statusLabelMap[release.status]}
                          <ChevronDown className="ml-0.5 h-3 w-3" />
                        </Badge>
                        <div className="absolute right-0 top-full z-50 mt-1 hidden group-hover:block group-active:block min-w-[100px]">
                          <div className="rounded-md border bg-popover p-1 shadow-md">
                            {nextStatus[release.status].map((targetStatus) => (
                              <button
                                key={targetStatus}
                                className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent whitespace-nowrap"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateStatusMutation.mutate({ id: release.id, status: targetStatus });
                                }}
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
                    {release.status !== 'CLOSED' && (
                      <Button
                        variant="ghost" size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); setEditingId(editingId === release.id ? null : release.id); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {release.version && (
                  <p className="text-xs text-muted-foreground">v{release.version}</p>
                )}
              </CardHeader>
              <CardContent onClick={(e) => e.stopPropagation()}>
                {editingId === release.id ? (
                  <EditReleaseForm release={release} onDone={() => setEditingId(null)} />
                ) : (
                  <>
                    {release.description && (
                      <p className="mb-2 text-sm text-muted-foreground">{release.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{t('featureCount', { count: release._count?.features ?? 0 })}</span>
                      {release.totalCapacity != null && (
                        <span>{t('capacity')}: {release.totalCapacity} {t('personDay')}</span>
                      )}
                      {release.startDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {t('start')}: {formatDate(release.startDate)}
                        </span>
                      )}
                      {release.stageDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {t('stage')}: {formatDate(release.stageDate)}
                        </span>
                      )}
                      {release.productionDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {t('prod')}: {formatDate(release.productionDate)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 迭代管理（Sprint：可挂 Release，也可独立） */}
      <SprintSection workspaceId={workspaceId} />
    </div>
  );
}
