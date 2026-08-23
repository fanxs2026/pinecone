'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { okrApi, featureApi, storyApi, releaseApi, type OkrObjective, type OkrKeyResult } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Target, Trash2, Link2, Unlink, Loader2, Pencil, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { showToast } from '@/components/simple-toast';
import { cn } from '@/lib/utils';

/** P3-A OKR 目标对齐：目标列表 + KR + 关联工作项 + 自动达成率 */
export default function OkrPage() {
  const t = useTranslations('okr');
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: objectives, isLoading } = useQuery({
    queryKey: ['okr', workspaceId],
    queryFn: () => okrApi.listObjectives(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: featuresRes } = useQuery({
    queryKey: ['features', workspaceId],
    queryFn: () => featureApi.list(workspaceId!, { pageSize: 100 }).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const { data: storiesRes } = useQuery({
    queryKey: ['stories', workspaceId],
    queryFn: () => storyApi.list(workspaceId!, { pageSize: 100 }).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const { data: releasesRes } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['okr', workspaceId] });

  const createObjective = useMutation({
    mutationFn: () => okrApi.createObjective(workspaceId!, { title: title.trim(), period: period.trim() || undefined }),
    onSuccess: () => { invalidate(); setShowForm(false); setTitle(''); setPeriod(''); showToast(t('created')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeObjective = useMutation({
    mutationFn: (id: string) => okrApi.removeObjective(workspaceId!, id),
    onSuccess: () => { invalidate(); showToast(t('removed')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const progressColor = (p: number) =>
    p >= 100 ? 'bg-green-500' : p >= 50 ? 'bg-blue-500' : p >= 25 ? 'bg-amber-500' : 'bg-gray-400';

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Target className="h-5 w-5 text-violet-600" />
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('desc')}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" />
          {t('newObjective')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 py-4">
            <div className="min-w-[240px] flex-1">
              <p className="mb-1 text-xs text-muted-foreground">{t('objTitle')}</p>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('objTitlePh')} />
            </div>
            <div className="w-40">
              <p className="mb-1 text-xs text-muted-foreground">{t('period')}</p>
              <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-Q4" />
            </div>
            <Button
              size="sm"
              disabled={!title.trim() || createObjective.isPending}
              onClick={() => createObjective.mutate()}
            >
              {createObjective.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
              {t('create')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !objectives || objectives.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('empty')}</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {objectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              expanded={expanded.has(obj.id)}
              onToggle={() => toggleExpand(obj.id)}
              onRemove={() => removeObjective.mutate(obj.id)}
              progressColor={progressColor}
              features={featuresRes?.items ?? []}
              stories={storiesRes?.items ?? []}
              releases={releasesRes?.items ?? []}
              invalidate={invalidate}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectiveCard({
  obj, expanded, onToggle, onRemove, progressColor, features, stories, releases, invalidate, t,
}: {
  obj: OkrObjective;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  progressColor: (p: number) => string;
  features: { id: string; title: string; code?: string }[];
  stories: { id: string; title: string; code?: string }[];
  releases: { id: string; name: string; version?: string }[];
  invalidate: () => void;
  t: any;
}) {
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [showKrForm, setShowKrForm] = useState(false);
  const [krTitle, setKrTitle] = useState('');
  const [krTarget, setKrTarget] = useState('');

  const addKr = useMutation({
    mutationFn: () => okrApi.addKeyResult(workspaceId!, obj.id, { title: krTitle.trim(), target: krTarget.trim() || undefined }),
    onSuccess: () => { invalidate(); setShowKrForm(false); setKrTitle(''); setKrTarget(''); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeKr = useMutation({
    mutationFn: (id: string) => okrApi.removeKeyResult(workspaceId!, id),
    onSuccess: () => invalidate(),
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onToggle} className="text-left">
              <CardTitle className="text-base">{obj.title}</CardTitle>
            </button>
            {obj.period && <Badge variant="outline" className="text-[10px]">{obj.period}</Badge>}
            <Badge variant="secondary" className="text-[10px]">{obj.keyResults.length} KR</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full transition-all', progressColor(obj.progress))} style={{ width: `${obj.progress}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{obj.progress}%</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} title={t('delete')}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {obj.keyResults.map((kr) => (
            <KrRow key={kr.id} kr={kr} workspaceId={workspaceId!} features={features} stories={stories} releases={releases} invalidate={invalidate} t={t} onRemove={() => removeKr.mutate(kr.id)} />
          ))}

          {showKrForm ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3">
              <Input value={krTitle} onChange={(e) => setKrTitle(e.target.value)} placeholder={t('krTitlePh')} className="h-8 flex-1 min-w-[180px]" />
              <Input value={krTarget} onChange={(e) => setKrTarget(e.target.value)} placeholder={t('krTargetPh')} className="h-8 w-48" />
              <Button size="sm" disabled={!krTitle.trim() || addKr.isPending} onClick={() => addKr.mutate()}>
                <Check className="mr-1 h-3.5 w-3.5" />{t('create')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowKrForm(false)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowKrForm(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />{t('addKr')}
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function KrRow({ kr, workspaceId, features, stories, releases, invalidate, t, onRemove }: {
  kr: OkrKeyResult;
  workspaceId: string;
  features: { id: string; title: string; code?: string }[];
  stories: { id: string; title: string; code?: string }[];
  releases: { id: string; name: string; version?: string }[];
  invalidate: () => void;
  t: any;
  onRemove: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkType, setLinkType] = useState<'FEATURE' | 'STORY' | 'RELEASE'>('STORY');
  const [linkId, setLinkId] = useState('');

  const linkMutation = useMutation({
    mutationFn: () => okrApi.linkItem(workspaceId, kr.id, linkType, linkId),
    onSuccess: () => { invalidate(); setLinkOpen(false); setLinkId(''); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ type, id }: { type: string; id: string }) => okrApi.unlinkItem(workspaceId, kr.id, type, id),
    onSuccess: () => invalidate(),
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const pickable =
    linkType === 'FEATURE' ? features :
    linkType === 'RELEASE' ? releases :
    stories;

  const entityHref = (type: string, id: string) =>
    type === 'FEATURE' ? `/features/${id}` : type === 'RELEASE' ? `/releases/${id}` : `/stories/${id}`;
  const entityLabel = (item: any) => item.entity?.title ?? item.entity?.name ?? item.entityId;
  const entityCode = (item: any) => item.entity?.code ?? item.entity?.version ?? '';

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{kr.title}</span>
            {kr.target && <Badge variant="outline" className="text-[10px] text-muted-foreground">{kr.target}</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', kr.progress >= 100 ? 'bg-green-500' : 'bg-blue-500')} style={{ width: `${kr.progress}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{kr.progress}% ({kr.itemCount} {t('items')})</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLinkOpen(!linkOpen)} title={t('linkItem')}>
            <Link2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove} title={t('delete')}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {linkOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-muted/30 p-2">
          <select
            value={linkType}
            onChange={(e) => { setLinkType(e.target.value as 'FEATURE' | 'STORY' | 'RELEASE'); setLinkId(''); }}
            className="h-8 rounded border border-input bg-background px-2 text-sm"
          >
            <option value="STORY">{t('storyType')}</option>
            <option value="FEATURE">{t('featureType')}</option>
            <option value="RELEASE">{t('releaseType')}</option>
          </select>
          <select
            value={linkId}
            onChange={(e) => setLinkId(e.target.value)}
            className="h-8 flex-1 min-w-[180px] rounded border border-input bg-background px-2 text-sm"
          >
            <option value="">{t('selectItem')}</option>
            {pickable.map((it) => (
              <option key={it.id} value={it.id}>
                {'code' in it && it.code ? `${it.code} ` : 'version' in it && it.version ? `${it.version} ` : ''}
                {'title' in it ? it.title : (it as { name: string }).name}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={!linkId || linkMutation.isPending} onClick={() => linkMutation.mutate()}>
            {t('link')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkOpen(false)}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {kr.linked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {kr.linked.map((item) => (
            <a
              key={`${item.entityType}-${item.entityId}`}
              href={entityHref(item.entityType, item.entityId)}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70 hover:text-primary"
              title={entityLabel(item)}
            >
              {entityCode(item) && <span className="font-mono text-[10px] text-muted-foreground">{entityCode(item)}</span>}
              <span className="max-w-[180px] truncate">{entityLabel(item)}</span>
              {item.entity?.status === 'DONE' && <span className="text-green-600">✓</span>}
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); unlinkMutation.mutate({ type: item.entityType, id: item.entityId }); }}
                title={t('unlink')}
              >
                <Unlink className="h-3 w-3" />
              </button>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
