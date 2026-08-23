'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Feature, featureApi, releaseApi, workspaceApi, relationApi, commentApi } from '@/lib/api-client';
import { FEATURE_STATUSES } from '@/lib/entity-statuses';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EntityTabs from '@/components/entity-tabs';
import CommentSection from '@/components/comment-section';
import HistoryTimeline from '@/components/history-timeline';
import RelationsPanel from '@/components/relations-panel';
import { GithubLinksSection } from '@/components/github-links-section';
import { ShareButton } from '@/components/share-button';
import TagInput from '@/components/tag-input';
import FileUpload from '@/components/file-upload';
import TimeEntryList from '@/components/time-entry-list';
import {Layers, Copy, Loader2 } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/date-utils';
import { getStatusBadgeClasses } from '@/lib/status-colors';
import { useTranslations } from 'next-intl';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';
import { OkrTracePanel } from '@/components/okr-trace-panel';
import {
  ENTITY_PRIORITIES,
  ENTITY_PRIORITY_COLORS,
  ENTITY_PRIORITY_LABELS,
  entityPriorityLabel,
  entityPriorityOption,
} from '@/lib/entity-priority';

const FEATURE_STATUS_VALUES = FEATURE_STATUSES as readonly string[];

export default function FeatureDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const id = params?.id as string;
  const t = useTranslations('feature');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const tt = useTranslations('tabs');
  const td = useTranslations('detail');

  const [editTitle, setEditTitle] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [descVal, setDescVal] = useState('');
  const [showClone, setShowClone] = useState(false);

  const { data: feature, isLoading } = useQuery({
    queryKey: ['feature', workspaceId, id],
    queryFn: () => featureApi.get(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 关联数量（页签角标）
  const { data: relationData } = useQuery({
    queryKey: ['relation-count', workspaceId, 'FEATURE', id],
    queryFn: () => relationApi.list(workspaceId!, 'FEATURE', id).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // 评论数量（页签角标）
  const { data: commentTotal } = useQuery({
    queryKey: ['comment-count', workspaceId, 'FEATURE', id],
    queryFn: () => commentApi.list(workspaceId!, 'FEATURE', id).then((r) => r.data.total),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      const normalized = { ...data } as Partial<Feature>;
      if ('effortEstimate' in normalized && normalized.effortEstimate === null) delete normalized.effortEstimate;
      return featureApi.update(workspaceId!, id, normalized).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature', workspaceId, id] });
      setEditTitle(false);
      setEditDesc(false);
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => relationApi.clone(workspaceId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['relations', workspaceId, 'FEATURE', id] });
      setShowClone(false);
    },
    onError: (err) => {
      const detail = (err as any)?.response?.data?.message || (err as Error).message;
      alert(`${t('cloneFailed')}: ${detail}`);
    },
  });

  if (wsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Layers className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{t('noWorkspaceTitle')}</h2>
        <p className="mb-6 text-muted-foreground">{t('noWorkspaceHint')}</p>
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

  if (!feature) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <Layers className="h-12 w-12" />
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const tabs = [
    { id: 'details', label: tt('details') },
    { id: 'comments', label: tt('comments'), badge: commentTotal || undefined },
    { id: 'history', label: tt('history') },
    { id: 'relations', label: tt('relations'), badge: relationData?.length },
    { id: 'github', label: tt('github') },
    { id: 'time', label: tt('time') },
  ];

  const tabContents: Record<string, React.ReactNode> = {
    details: (
      <Card>
        <CardContent className="divide-y">
          {/* Title */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('title')}</span>
            {editTitle ? (
              <div className="flex flex-1 items-center gap-2">
                <Input
                  value={titleVal}
                  onChange={(e) => setTitleVal(e.target.value)}
                  className="flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (titleVal.trim() && titleVal !== feature.title) updateMutation.mutate({ title: titleVal });
                      else setEditTitle(false);
                    }
                    if (e.key === 'Escape') setEditTitle(false);
                  }}
                />
                <Button size="sm" onClick={() => { if (titleVal.trim() && titleVal !== feature.title) updateMutation.mutate({ title: titleVal }); else setEditTitle(false); }}>{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditTitle(false)}>{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm font-medium">{feature.title}</span>
                <Button variant="ghost" size="sm" onClick={() => { setTitleVal(feature.title); setEditTitle(true); }}>{c('edit')}</Button>
                <ShareButton workspaceId={workspaceId} entityType="FEATURE" entityId={id} />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('description')}</span>
            {editDesc ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea
                  value={descVal}
                  onChange={(e) => setDescVal(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Escape') setEditDesc(false); }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { if (descVal !== (feature.description || '')) updateMutation.mutate({ description: descVal || undefined }); else setEditDesc(false); }}>{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditDesc(false)}>{c('cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm text-muted-foreground whitespace-pre-wrap">{feature.description || td('noDescription')}</span>
                <Button variant="ghost" size="sm" onClick={() => { setDescVal(feature.description || ''); setEditDesc(true); }}>{c('edit')}</Button>
              </div>
            )}
          </div>

          {/* Epic 标记 */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('epicLabel')}</span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!feature.isEpic}
                onChange={(e) => updateMutation.mutate({ isEpic: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-violet-600"
              />
              {feature.isEpic ? t('epicEnabled') : t('epicDisabled')}
            </label>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('status')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={feature.status}
              onChange={(e) => updateMutation.mutate({ status: e.target.value })}
            >
              {FEATURE_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>{tStatus(`FEATURE_${v}`)}</option>
              ))}
            </select>
            <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', feature.status)}>{tStatus(`FEATURE_${feature.status}`) || feature.status}</Badge>
          </div>

          {/* Priority（2026-08-15：可编辑，P1-P5，默认 P3） */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('priority')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={ENTITY_PRIORITY_LABELS[feature.priority] ? feature.priority : 'P3'}
              onChange={(e) => updateMutation.mutate({ priority: e.target.value })}
            >
              {ENTITY_PRIORITIES.map((p) => (
                <option key={p} value={p}>{entityPriorityOption(p)}</option>
              ))}
            </select>
          </div>

          {/* Code */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{td('code')}</span>
            <span className="text-sm font-mono tracking-wider">{feature.code || '-'}</span>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('owner')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={feature.assignee?.id || ''}
              onChange={(e) => updateMutation.mutate({ assigneeId: e.target.value || null })}
            >
              <option value="">{t('unassigned')}</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name || m.user.email}</option>
              ))}
            </select>
          </div>

          {/* Release */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{td('release')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={feature.releaseId ?? ''}
              onChange={(e) => updateMutation.mutate({ releaseId: e.target.value || null })}
            >
              <option value="">{t('unassigned')}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Effort */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{td('effort')}</span>
            <input
              type="number"
              className="flex h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm"
              value={feature.effortEstimate ?? ''}
              placeholder="--"
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value);
                updateMutation.mutate({ effortEstimate: val, effortUnit: feature.effortUnit || 'HOURS' });
              }}
            />
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={feature.effortUnit || 'HOURS'}
              onChange={(e) => updateMutation.mutate({ effortUnit: e.target.value, effortEstimate: feature.effortEstimate ?? null })}
            >
              <option value="HOURS">{td('hours')}</option>
              <option value="DAYS">{td('days')}</option>
            </select>
          </div>

          {/* Tags */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{c('tags')}</span>
            <div className="flex-1">
              <TagInput
                workspaceId={workspaceId}
                tags={(feature as any).tags ?? []}
                onChange={(tags) => updateMutation.mutate({ tags } as any)}
              />
            </div>
          </div>

          {/* Creator / Dates */}
          <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <span className="w-20 shrink-0">{td('creator')}</span>
            <span>{feature.createdBy?.name || feature.createdBy?.email}</span>
            <span className="ml-4">· {formatDateTime(feature.createdAt)}</span>
            {feature.updatedAt !== feature.createdAt && (
              <span className="ml-2">{td('updated')}: {formatDateTime(feature.updatedAt)}</span>
            )}
          </div>

          {/* Stories count */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('storiesCount')}</span>
            <span className="text-sm">{(feature as any)._count?.stories ?? (feature as any).stories?.length ?? 0}</span>
          </div>

          {/* Operation area: clone + file upload + log work */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{td('operations')}</span>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {!showClone ? (
                  <Button size="sm" variant="outline" onClick={() => setShowClone(true)}>
                    <Copy className="mr-1 h-3 w-3 text-blue-600" />{t('cloneToStory')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('cloneConfirmHint')}</span>
                    <Button size="sm" onClick={() => cloneMutation.mutate()} disabled={cloneMutation.isPending}>
                      {cloneMutation.isPending ? t('cloning') : t('cloneConfirm')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowClone(false)}>{c('cancel')}</Button>
                  </div>
                )}
                <FileUpload workspaceId={workspaceId} entityType="FEATURE" entityId={id} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    comments: (
      <CommentSection workspaceId={workspaceId} entityType="FEATURE" entityId={id} />
    ),
    history: (
      <HistoryTimeline workspaceId={workspaceId} entityType="FEATURE" entityId={id} />
    ),
    relations: (
      <RelationsPanel
        workspaceId={workspaceId}
        entityType="FEATURE"
        entityId={id}
        entityTitle={feature.title}
      />
    ),
    github: (
      <GithubLinksSection workspaceId={workspaceId} entityType="FEATURE" entityId={id} />
    ),
    time: (
      <TimeEntryList
        workspaceId={workspaceId}
        entityType="FEATURE"
        entityId={id}
        estimatedHours={(feature as any).effortEstimate ?? null}
      />
    ),
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          {feature.code && (
            <Badge variant="outline" className="font-mono text-xs tracking-wider">{feature.code}</Badge>
          )}
          {/* 2026-08-14：状态下拉移至编号右侧 */}
          <select
            className="inline-flex h-6 items-center rounded-md border border-input bg-transparent px-1.5 text-xs font-medium"
            value={feature.status}
            onChange={(e) => updateMutation.mutate({ status: e.target.value })}
          >
            {FEATURE_STATUS_VALUES.map((v) => (
              <option key={v} value={v}>{tStatus(`FEATURE_${v}`) || v}</option>
            ))}
          </select>
          <VoteButton wsId={workspaceId!} entityType="FEATURE" entityId={id} count={(feature as any).voteCount ?? 0} invalidateKeys={['feature', workspaceId, id]} />
          <ScoreEditor wsId={workspaceId!} entityType="FEATURE" entityId={id} score={(feature as any).score ?? null} invalidateKeys={['feature', workspaceId, id]} />
          <h1 className="text-2xl font-bold tracking-tight">{feature.title}</h1>
        </div>
        <OkrTracePanel entityType="FEATURE" entityId={id} />
        <div className="text-muted-foreground">
          <Badge
            variant="secondary"
            className={ENTITY_PRIORITY_COLORS[feature.priority] || 'bg-gray-100 text-gray-500'}
            title={ENTITY_PRIORITY_LABELS[feature.priority] ?? feature.priority}
          >
            {entityPriorityLabel(feature.priority)}
          </Badge>
          <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', feature.status)}>
            {tStatus(`FEATURE_${feature.status}`) || feature.status}
          </Badge>
          {feature.release && <span className="ml-2">{feature.release.name}</span>}
          {(feature.assignee?.name || feature.assigneeName) && <span className="ml-2">{feature.assignee?.name || feature.assigneeName}</span>}
          <span className="ml-2">· {feature.createdBy?.name || feature.createdBy?.email} · {formatDate(feature.createdAt)}</span>
        </div>
      </div>

      <EntityTabs tabs={tabs} defaultTab="details" tabContents={tabContents} />
    </div>
  );
}
