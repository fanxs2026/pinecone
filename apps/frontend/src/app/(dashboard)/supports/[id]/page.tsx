'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supportApi, relationApi, featureApi, workspaceApi, commentApi, releaseApi } from '@/lib/api-client';
import { SUPPORT_STATUSES as SUPPORT_STATUSES_ALL, SUPPORT_SEVERITIES, SUPPORT_SEVERITY_LABELS } from '@/lib/entity-statuses';
import { formatDate, formatDateTime } from '@/lib/date-utils';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTranslations } from 'next-intl';
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
import {LifeBuoy, ArrowUp, Copy, Bug, Loader2 } from 'lucide-react';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';

const SUPPORT_STATUSES: { value: string; color: string }[] = SUPPORT_STATUSES_ALL.map((v) => ({
  value: v,
  color: {
    OPEN: 'bg-blue-100 text-blue-700',
    IN_REVIEW: 'bg-yellow-100 text-yellow-700',
    CLOSED: 'bg-green-100 text-green-700',
  }[v] ?? 'bg-gray-100 text-gray-700',
}));

const SUPPORT_TYPES: { value: string; color: string }[] = [
  { value: 'SUPPORT_REQUEST', color: 'bg-purple-100 text-purple-700' },
  { value: 'DEFECT', color: 'bg-red-100 text-red-700' },
];

const statusColorMap: Record<string, string> = Object.fromEntries(
  SUPPORT_STATUSES.map((s) => [s.value, s.color])
);

export default function SupportDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const id = params?.id as string;
  const t = useTranslations('support');
  const td = useTranslations('detail');
  const tt = useTranslations('tabs');
  const c = useTranslations('common');

  const statusLabelMap: Record<string, string> = {
    OPEN: t('open'),
    IN_REVIEW: t('inReview'),
    CLOSED: t('closed'),
  };

  const typeLabelMap: Record<string, string> = {
    SUPPORT_REQUEST: t('SUPPORT_REQUEST'),
    DEFECT: t('DEFECT'),
  };

  const [editTitle, setEditTitle] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [descVal, setDescVal] = useState('');

  const [showCloneStory, setShowCloneStory] = useState(false);
  const [cloneFeatureId, setCloneFeatureId] = useState('');

  const { data: support, isLoading } = useQuery({
    queryKey: ['support', workspaceId, id],
    queryFn: () => supportApi.get(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });

  const { data: featuresData } = useQuery({
    queryKey: ['features', workspaceId],
    queryFn: () => featureApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const features = featuresData?.items ?? [];

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 关联数量（页签角标）
  const { data: relationData } = useQuery({
    queryKey: ['relation-count', workspaceId, 'SUPPORT', id],
    queryFn: () => relationApi.list(workspaceId!, 'SUPPORT', id).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // 评论数量（页签角标）
  const { data: commentTotal } = useQuery({
    queryKey: ['comment-count', workspaceId, 'SUPPORT', id],
    queryFn: () => commentApi.list(workspaceId!, 'SUPPORT', id).then((r) => r.data.total),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // 发布周期（缺陷挂 Release：回归闭环锚点）
  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  // 来源用例（TestRun 失败一键建缺陷时建的 TEST_CASE ← SUPPORT 关系）
  const sourceCases = (relationData ?? []).filter(
    (rel) => rel.relatedEntityType === 'TEST_CASE',
  );

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      supportApi.update(workspaceId!, id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', workspaceId, id] });
      setEditTitle(false);
      setEditDesc(false);
    },
  });

  const cloneToIdeaMutation = useMutation({
    mutationFn: () => relationApi.cloneSupportToIdea(workspaceId!, id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['relation-count', workspaceId, 'SUPPORT', id] });
    },
  });

  const cloneToFeatureMutation = useMutation({
    mutationFn: () => relationApi.cloneSupportToFeature(workspaceId!, id).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['relation-count', workspaceId, 'SUPPORT', id] });
    },
  });

  const cloneToStoryMutation = useMutation({
    mutationFn: () => relationApi.cloneSupportToStory(workspaceId!, id, { featureId: cloneFeatureId }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support', workspaceId, id] });
      queryClient.invalidateQueries({ queryKey: ['relation-count', workspaceId, 'SUPPORT', id] });
      setShowCloneStory(false);
      setCloneFeatureId('');
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
        <LifeBuoy className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!support) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <LifeBuoy className="h-12 w-12" />
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
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (titleVal.trim() && titleVal !== support.title) updateMutation.mutate({ title: titleVal });
                      else setEditTitle(false);
                    }
                    if (e.key === 'Escape') setEditTitle(false);
                  }}
                />
                <Button size="sm" onClick={() => { if (titleVal.trim() && titleVal !== support.title) updateMutation.mutate({ title: titleVal }); else setEditTitle(false); }}>{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditTitle(false)}>{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm font-medium">{support.title}</span>
                <Button variant="ghost" size="sm" onClick={() => { setTitleVal(support.title); setEditTitle(true); }}>{c('edit')}</Button>
                <ShareButton workspaceId={workspaceId} entityType="SUPPORT" entityId={id} />
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
                  <Button size="sm" onClick={() => { if (descVal !== (support.description || '')) updateMutation.mutate({ description: descVal || undefined }); else setEditDesc(false); }}>{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditDesc(false)}>{c('cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm text-muted-foreground whitespace-pre-wrap">{support.description || td('noDescription')}</span>
                <Button variant="ghost" size="sm" onClick={() => { setDescVal(support.description || ''); setEditDesc(true); }}>{c('edit')}</Button>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('status')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={support.status}
              onChange={(e) => updateMutation.mutate({ status: e.target.value })}
            >
              {SUPPORT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{statusLabelMap[s.value]}</option>
              ))}
            </select>
            <Badge variant="secondary" className={statusColorMap[support.status] || ''}>
              {statusLabelMap[support.status]}
            </Badge>
          </div>

          {/* Type */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('type')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={support.type}
              onChange={(e) => updateMutation.mutate({ type: e.target.value })}
            >
              {SUPPORT_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{typeLabelMap[s.value]}</option>
              ))}
            </select>
            <Badge variant="secondary" className={SUPPORT_TYPES.find((s) => s.value === support.type)?.color || ''}>
              {typeLabelMap[support.type]}
            </Badge>
          </div>

          {/* Severity（仅缺陷） */}
          {support.type === 'DEFECT' && (
            <div className="flex items-center gap-3 py-3">
              <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('severity')}</span>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={support.severity ?? ''}
                onChange={(e) => updateMutation.mutate({ severity: e.target.value || null })}
              >
                <option value="">{t('severityUnassigned')}</option>
                {SUPPORT_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{SUPPORT_SEVERITY_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
          )}

          {/* Root Cause（仅缺陷，选填） */}
          {support.type === 'DEFECT' && (
            <div className="flex items-start gap-3 py-3">
              <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{t('rootCause')}</span>
              <textarea
                className="min-h-[80px] flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                placeholder={t('rootCausePlaceholder')}
                defaultValue={support.rootCause || ''}
                onBlur={(e) => { if (e.target.value !== (support.rootCause || '')) updateMutation.mutate({ rootCause: e.target.value || null }); }}
              />
            </div>
          )}

          {/* Discovery Phase（仅缺陷，选填；G1-P1 逃逸率口径 2026-08-16） */}
          {support.type === 'DEFECT' && (
            <div className="flex items-center gap-3 py-3">
              <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('phase')}</span>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={support.discoveryPhase ?? ''}
                onChange={(e) => updateMutation.mutate({ discoveryPhase: e.target.value || null })}
              >
                <option value="">{t('phaseUnassigned')}</option>
                <option value="TEST">{t('phaseTest')}</option>
                <option value="PRODUCTION">{t('phaseProduction')}</option>
                <option value="CUSTOMER">{t('phaseCustomer')}</option>
              </select>
            </div>
          )}

          {/* 关联发布周期（Phase 1：缺陷挂 Release，回归闭环锚点） */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('releaseLabel')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={support.releaseId ?? ''}
              onChange={(e) => updateMutation.mutate({ releaseId: e.target.value || null })}
            >
              <option value="">{t('unassigned')}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>{r.version ? `${r.name} (${r.version})` : r.name}</option>
              ))}
            </select>
            {sourceCases.length > 0 && (
              <span className="flex items-center gap-1 text-xs">
                {sourceCases.map((rel) => (
                  <a
                    key={rel.relatedEntityId}
                    href={`/test-cases/${rel.relatedEntityId}`}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100"
                  >
                    <Bug className="h-3 w-3" />
                    {rel.relatedCode ? `${rel.relatedCode} ` : ''}{t('sourceCase')}
                  </a>
                ))}
              </span>
            )}
          </div>

          {/* Code */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('code')}</span>
            <span className="text-sm font-mono tracking-wider">{support.code || '-'}</span>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('owner')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={support.assignee?.id || ''}
              onChange={(e) => updateMutation.mutate({ assigneeId: e.target.value || null })}
            >
              <option value="">{t('unassigned')}</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name || m.user.email}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{c('tags')}</span>
            <div className="flex-1">
              <TagInput
                workspaceId={workspaceId}
                tags={(support as any).tags ?? []}
                onChange={(tags) => updateMutation.mutate({ tags } as any)}
              />
            </div>
          </div>

          {/* Creator & Dates */}
          <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <span className="w-20 shrink-0">{td('creator')}</span>
            <span>{support.createdBy?.name || support.createdBy?.email}</span>
            <span className="ml-4">· {formatDateTime(support.createdAt)}</span>
            {support.updatedAt !== support.createdAt && (
              <span className="ml-2">({td('updated')}: {formatDateTime(support.updatedAt)})</span>
            )}
          </div>

          {/* Operation area: clone + file upload + log work */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{c('actions')}</span>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cloneToIdeaMutation.mutate()}
                  disabled={cloneToIdeaMutation.isPending}
                >
                  <Copy className="mr-1 h-3 w-3" /> {t('cloneToIdea')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cloneToFeatureMutation.mutate()}
                  disabled={cloneToFeatureMutation.isPending}
                >
                  <Copy className="mr-1 h-3 w-3" /> {t('cloneToFeature')}
                </Button>
                {!showCloneStory ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCloneStory(true)}
                  >
                    <ArrowUp className="mr-1 h-3 w-3" /> {t('cloneToStory')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={cloneFeatureId}
                      onChange={(e) => setCloneFeatureId(e.target.value)}
                    >
                      <option value="">{t('selectFeature')}</option>
                      {features.map((f) => (
                        <option key={f.id} value={f.id}>{f.title}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      onClick={() => cloneToStoryMutation.mutate()}
                      disabled={!cloneFeatureId || cloneToStoryMutation.isPending}
                    >
                      {cloneToStoryMutation.isPending ? t('cloning') : c('confirm')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowCloneStory(false); setCloneFeatureId(''); }}>
                      {c('cancel')}
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FileUpload workspaceId={workspaceId} entityType="SUPPORT" entityId={id} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    comments: <CommentSection workspaceId={workspaceId} entityType="SUPPORT" entityId={id} />,
    history: <HistoryTimeline workspaceId={workspaceId} entityType="SUPPORT" entityId={id} />,
    relations: <RelationsPanel workspaceId={workspaceId} entityType="SUPPORT" entityId={id} entityTitle={support.title} />,
    github: (
      <GithubLinksSection workspaceId={workspaceId} entityType="SUPPORT" entityId={id} />
    ),
    time: <TimeEntryList workspaceId={workspaceId} entityType="SUPPORT" entityId={id} />,
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          {support.code && (
            <Badge variant="outline" className="font-mono text-xs tracking-wider">{support.code}</Badge>
          )}
          {/* 2026-08-14：状态下拉移至编号右侧 */}
          <select
            className="inline-flex h-6 items-center rounded-md border border-input bg-transparent px-1.5 text-xs font-medium"
            value={support.status}
            onChange={(e) => updateMutation.mutate({ status: e.target.value })}
          >
            {SUPPORT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{statusLabelMap[s.value] || s.value}</option>
            ))}
          </select>
          <VoteButton wsId={workspaceId!} entityType="SUPPORT" entityId={id} count={(support as any).voteCount ?? 0} invalidateKeys={['support', workspaceId, id]} />
          <ScoreEditor wsId={workspaceId!} entityType="SUPPORT" entityId={id} score={(support as any).score ?? null} invalidateKeys={['support', workspaceId, id]} />
          <h1 className="text-2xl font-bold tracking-tight">{support.title}</h1>
        </div>
        <div className="text-muted-foreground text-sm">
          <Badge variant="secondary" className={SUPPORT_TYPES.find((s) => s.value === support.type)?.color || 'bg-gray-100'}>
            {typeLabelMap[support.type]}
          </Badge>
          <Badge variant="secondary" className={`ml-1 ${statusColorMap[support.status] || 'bg-gray-100'}`}>
            {statusLabelMap[support.status]}
          </Badge>
          {(support.assignee?.name || support.assigneeName) && (
            <span className="ml-2">{c('owner')}: {support.assignee?.name || support.assigneeName}</span>
          )}
          <span className="ml-2">
            {support.createdBy?.name || support.createdBy?.email} ·{' '}
            {formatDate(support.createdAt)}
          </span>
        </div>
      </div>
      <EntityTabs tabs={tabs} defaultTab="details" tabContents={tabContents} />
    </div>
  );
}
