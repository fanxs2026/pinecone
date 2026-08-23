'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storyApi, workspaceApi, releaseApi, relationApi, commentApi, sprintsApi, kbPagesApi } from '@/lib/api-client';
import { STORY_STATUSES } from '@/lib/entity-statuses';
import { formatDate, formatDateTime } from '@/lib/date-utils';
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
import { OkrTracePanel } from '@/components/okr-trace-panel';
import FileUpload from '@/components/file-upload';
import TimeEntryList from '@/components/time-entry-list';
import StoryTestTab from '@/components/story-test-tab';
import { SubtasksSection } from '@/components/subtasks-section';
import { ShareButton } from '@/components/share-button';
import { showToast } from '@/components/simple-toast';
import { Columns3, Loader2, Trash2 } from 'lucide-react';
import { getStatusBadgeClasses } from '@/lib/status-colors';
import { useTranslations } from 'next-intl';
import {
  STORY_PRIORITIES,
  STORY_PRIORITY_COLORS,
  STORY_PRIORITY_LABELS,
  storyPriorityLabel,
  storyPriorityOption,
} from '@/lib/story-priority';

const STORY_STATUS_VALUES = STORY_STATUSES as readonly string[];

export default function StoryDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const id = params?.id as string;
  const t = useTranslations('story');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const tt = useTranslations('tabs');
  const td = useTranslations('detail');
  // 状态标签：状态是自由 String，缺失翻译时回退到原始值，避免脏数据（如历史 TODO）导致整页崩溃
  const statusLabel = (status: string): string => {
    try {
      return tStatus(`STORY_${status}`);
    } catch {
      return status;
    }
  };

  const [editField, setEditField] = useState<'title' | 'description' | 'criteria' | null>(null);
  const [editVal, setEditVal] = useState('');
  const [editHours, setEditHours] = useState<number | null>(null);

  // G1 知识库 P1-A：相关知识（反向查询）+ 一键沉淀
  const { data: kbPages = [] } = useQuery({
    queryKey: ['kb-entity-pages', workspaceId, 'STORY', id],
    queryFn: () => kbPagesApi.entityPages(workspaceId!, 'STORY', id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });
  const kbMutation = useMutation({
    mutationFn: () => kbPagesApi.createFromEntity(workspaceId!, { entityType: 'STORY', entityId: id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entity-pages', workspaceId, 'STORY', id] });
    },
  });
  // G1 P1-A：解除知识关联（仅解除链接，不删除 KB 页本身）
  const kbRemoveMutation = useMutation({
    mutationFn: ({ pageId, linkId }: { pageId: string; linkId: string }) =>
      kbPagesApi.removeLink(workspaceId!, pageId, linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-entity-pages', workspaceId, 'STORY', id] });
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message;
      showToast(Array.isArray(msg) ? msg[0] : (msg || t('removeKbFailed')));
    },
  });

  const { data: story, isLoading } = useQuery({
    queryKey: ['story', workspaceId, id],
    queryFn: () => storyApi.get(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });

  const { data: members } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: sprints } = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => sprintsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 关联数量（页签角标）
  const { data: relationData } = useQuery({
    queryKey: ['relation-count', workspaceId, 'STORY', id],
    queryFn: () => relationApi.list(workspaceId!, 'STORY', id).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // 评论数量（页签角标）
  const { data: commentTotal } = useQuery({
    queryKey: ['comment-count', workspaceId, 'STORY', id],
    queryFn: () => commentApi.list(workspaceId!, 'STORY', id).then((r) => r.data.total),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      storyApi.update(workspaceId!, id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['story', workspaceId, id] });
      setEditField(null);
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
        <Columns3 className="mb-4 h-12 w-12 text-muted-foreground" />
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

  if (!story) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <Columns3 className="h-12 w-12" />
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const startEdit = (field: 'title' | 'description' | 'criteria') => {
    setEditVal(
      field === 'title' ? story.title :
      field === 'description' ? (story.description || '') :
      (story.acceptanceCriteria || '')
    );
    setEditField(field);
  };

  const saveEdit = () => {
    if (!editField) return;
    const key = editField === 'criteria' ? 'acceptanceCriteria' : editField;
    const current = String(
      editField === 'criteria' ? (story.acceptanceCriteria || '') :
      editField === 'description' ? (story.description || '') :
      story.title
    );
    if (editVal !== current) {
      updateMutation.mutate({ [key]: editVal || undefined });
    } else {
      setEditField(null);
    }
  };

  const priorityLabel = (p: string) => storyPriorityLabel(p);

  const tabs = [
    { id: 'details', label: tt('details') },
    { id: 'comments', label: tt('comments'), badge: commentTotal || undefined },
    { id: 'history', label: tt('history') },
    { id: 'relations', label: tt('relations'), badge: relationData?.length },
    { id: 'github', label: tt('github') },
    { id: 'time', label: tt('time') },
    { id: 'test', label: tt('test') },
  ];

  const tabContents: Record<string, React.ReactNode> = {
    details: (
      <Card>
        <CardContent className="divide-y">
          {/* Title */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('title')}</span>
            {editField === 'title' ? (
              <div className="flex flex-1 items-center gap-2">
                <Input value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditField(null); }} />
                <Button size="sm" onClick={saveEdit}>{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditField(null)}>{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm font-medium">{story.title}</span>
                <Button variant="ghost" size="sm" onClick={() => startEdit('title')}>{c('edit')}</Button>
                <ShareButton workspaceId={workspaceId} entityType="STORY" entityId={id} />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('description')}</span>
            {editField === 'description' ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea value={editVal} onChange={e => setEditVal(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" autoFocus
                  onKeyDown={e => { if (e.key === 'Escape') setEditField(null); }} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit}>{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditField(null)}>{c('cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm text-muted-foreground">{story.description || td('noDescription')}</span>
                <Button variant="ghost" size="sm" onClick={() => startEdit('description')}>{c('edit')}</Button>
              </div>
            )}
          </div>

          {/* Acceptance Criteria */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('acceptanceCriteria')}</span>
            {editField === 'criteria' ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea value={editVal} onChange={e => setEditVal(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" autoFocus
                  onKeyDown={e => { if (e.key === 'Escape') setEditField(null); }} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit}>{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditField(null)}>{c('cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm text-muted-foreground">{story.acceptanceCriteria || t('noCriteria')}</span>
                <Button variant="ghost" size="sm" onClick={() => startEdit('criteria')}>{c('edit')}</Button>
              </div>
            )}
          </div>

          {/* Status（2026-08-22：改为详情页内可编辑下拉，顶部下拉已移除） */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('status')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={story.status}
              onChange={(e) => updateMutation.mutate({ status: e.target.value })}
            >
              {STORY_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>{tStatus(`STORY_${v}`) || v}</option>
              ))}
            </select>
            <Badge variant="secondary" className={getStatusBadgeClasses('STORY', story.status)}>
              {statusLabel(story.status)}
            </Badge>
          </div>

          {/* Priority（2026-08-15：可编辑，P1-P5，默认 P3） */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('priority')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={STORY_PRIORITY_LABELS[story.priority] ? story.priority : 'P3'}
              onChange={(e) => updateMutation.mutate({ priority: e.target.value })}
            >
              {STORY_PRIORITIES.map((p) => (
                <option key={p} value={p}>{storyPriorityOption(p)}</option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('owner')}</span>
            <select className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={story.assignee?.id || ''}
              onChange={e => updateMutation.mutate({ assigneeId: e.target.value || null })}>
              <option value="">{t('unassigned')}</option>
              {members?.map(m => (
                <option key={m.user.id} value={m.user.id}>{m.user.name || m.user.email}</option>
              ))}
            </select>
          </div>

          {/* Sprint 迭代 */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('sprintLabel')}</span>
            <select className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={story.sprintId || ''}
              onChange={e => updateMutation.mutate({ sprintId: e.target.value || null })}>
              <option value="">{t('noSprint')}</option>
              {(sprints ?? []).map(sp => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          </div>

          {/* G1 知识库 P1-A：相关知识 + 一键沉淀 */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 pt-0.5 text-sm text-muted-foreground">{td('kbKnowledge')}</span>
            <div className="flex-1 space-y-1.5">
              {kbPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{td('noKbPages')}</p>
              ) : (
                kbPages.map((kb) => (
                  <div key={kb.id} className="group flex items-center gap-1.5">
                    <Link
                      href={`/kb/${kb.page.spaceId ?? 'all'}/${kb.page.id}`}
                      className="block flex-1 truncate rounded-md border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      📄 {kb.page.title}
                      {kb.linkType === 'GENERATED_FROM' && (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          {td('depositedBadge')}
                        </span>
                      )}
                    </Link>
                    <button
                      type="button"
                      title={td('removeKbLink')}
                      aria-label={td('removeKbLink')}
                      onClick={() => kbRemoveMutation.mutate({ pageId: kb.page.id, linkId: kb.id })}
                      disabled={kbRemoveMutation.isPending}
                      className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => kbMutation.mutate()}
                disabled={kbMutation.isPending}
              >
                <Columns3 className="mr-1 h-3.5 w-3.5" />
                {td('depositToKb')}
              </Button>
            </div>
          </div>

          {/* Estimate Hours */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('estimateHours')}</span>
            <input type="number" min="0" step="0.5"
              className="flex h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm"
              value={editHours ?? story.estimateHours ?? ''}
              onChange={e => setEditHours(e.target.value ? parseFloat(e.target.value) : null)}
              onBlur={() => {
                if (editHours !== null && editHours !== (story.estimateHours ?? null)) {
                  updateMutation.mutate({ estimateHours: editHours });
                }
                setEditHours(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <span className="text-xs text-muted-foreground">{td('hours')}</span>
          </div>

          {/* Feature */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('belongsToFeature')}</span>
            {story.feature ? (
              <Link href={`/features/${story.feature.id}`} className="text-sm font-medium text-primary hover:underline">
                {story.feature.title}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">{t('notLinked')}</span>
            )}
          </div>

          {/* Release (fix version) */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('releaseLabel')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={story.releaseId ?? ''}
              onChange={(e) => updateMutation.mutate({ releaseId: e.target.value || null })}
            >
              <option value="">{t('unassigned')}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.version ? `${r.name} (${r.version})` : r.name}
                </option>
              ))}
            </select>
          </div>

          {/* Creator & Dates */}
          <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <span className="w-20 shrink-0">{t('createdInfo')}</span>
            <span>{story.createdBy?.name || story.createdBy?.email}</span>
            <span className="ml-4">· {formatDateTime(story.createdAt)}</span>
            {story.updatedAt !== story.createdAt && (
              <span className="ml-2">{td('updated')}: {formatDateTime(story.updatedAt)}</span>
            )}
          </div>

          {/* Operation area: file upload */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{td('operations')}</span>
            <div className="flex flex-wrap items-center gap-2">
              <FileUpload workspaceId={workspaceId} entityType="STORY" entityId={id} />
            </div>
          </div>

          {/* Subtasks */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{t('subtasks')}</span>
            <div className="flex-1">
              <SubtasksSection workspaceId={workspaceId} storyId={id} featureId={story.featureId} />
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    comments: (
      <CommentSection workspaceId={workspaceId} entityType="STORY" entityId={id} />
    ),
    history: (
      <HistoryTimeline workspaceId={workspaceId} entityType="STORY" entityId={id} />
    ),
    relations: (
      <RelationsPanel
        workspaceId={workspaceId}
        entityType="STORY"
        entityId={id}
        entityTitle={story.title}
      />
    ),
    github: (
      <GithubLinksSection workspaceId={workspaceId} entityType="STORY" entityId={id} />
    ),
    time: (
      <TimeEntryList
        workspaceId={workspaceId}
        storyId={id}
        estimatedHours={story.estimateHours ?? null}
        totalHoursOverride={story.loggedHours ?? null}
      />
    ),
    test: (
      <StoryTestTab workspaceId={workspaceId} storyId={id} />
    ),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {story.code && <Badge variant="outline" className="mr-2 font-mono text-xs tracking-wider">{story.code}</Badge>}
          {story.title}
        </h1>
        <OkrTracePanel entityType="STORY" entityId={id} />
        <div className="text-muted-foreground text-sm">
          <Badge variant="secondary" className={STORY_PRIORITY_COLORS[story.priority] || 'bg-gray-100 text-gray-500'}>
            {priorityLabel(story.priority)}
          </Badge>
          <Badge variant="secondary" className={getStatusBadgeClasses('STORY', story.status)}>
            {statusLabel(story.status)}
          </Badge>
          {story.feature && (
            <span className="ml-2">{story.feature.title}</span>
          )}
          {story.assignee && (
            <span className="ml-2">{c('owner')}: {story.assignee.name || story.assignee.email}</span>
          )}
          <span className="ml-2">· {formatDate(story.createdAt)}</span>
        </div>
      </div>

      <EntityTabs tabs={tabs} defaultTab="details" tabContents={tabContents} />
    </div>
  );
}
