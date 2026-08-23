'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ideaApi, relationApi, workspaceApi, commentApi, todoApi } from '@/lib/api-client';
import { IDEA_STATUSES } from '@/lib/entity-statuses';
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
import { ShareButton } from '@/components/share-button';
import TagInput from '@/components/tag-input';
import FileUpload from '@/components/file-upload';
import TimeEntryList from '@/components/time-entry-list';
import { TodoList } from '@/components/todo-list';
import { Lightbulb, ArrowUp, Loader2 } from 'lucide-react';
import { getStatusBadgeClasses } from '@/lib/status-colors';
import { useTranslations } from 'next-intl';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';

const IDEA_STATUS_VALUES = IDEA_STATUSES as readonly string[];

export default function IdeaDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { workspaceId, isLoading: wsLoading } = useWorkspace();
  const id = params?.id as string;
  const t = useTranslations('ideas');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const tt = useTranslations('tabs');
  const td = useTranslations('detail');

  const [editTitle, setEditTitle] = useState(false);
  const [editDesc, setEditDesc] = useState(false);
  const [titleVal, setTitleVal] = useState('');
  const [descVal, setDescVal] = useState('');
  const [showPromote, setShowPromote] = useState(false);
  const [promotePriority, setPromotePriority] = useState('P2');

  const { data: idea, isLoading } = useQuery({
    queryKey: ['idea', workspaceId, id],
    queryFn: () => ideaApi.get(workspaceId!, id).then((r) => r.data),
    enabled: !!workspaceId && !!id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 关联数量（页签角标）
  const { data: relationData } = useQuery({
    queryKey: ['relation-count', workspaceId, 'IDEA', id],
    queryFn: () => relationApi.list(workspaceId!, 'IDEA', id).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // 评论数量（页签角标）
  const { data: commentTotal } = useQuery({
    queryKey: ['comment-count', workspaceId, 'IDEA', id],
    queryFn: () => commentApi.list(workspaceId!, 'IDEA', id).then((r) => r.data.total),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // TO-DO 数量（页签角标，样式同评论角标）
  const { data: todoTotal } = useQuery({
    queryKey: ['todo-count', workspaceId, 'IDEA', id],
    queryFn: () => todoApi.list(workspaceId!, id).then((r) => r.data.length),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      ideaApi.update(workspaceId!, id, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idea', workspaceId, id] });
      setEditTitle(false); setEditDesc(false);
    },
  });

  const promoteMutation = useMutation({
    mutationFn: () => relationApi.promote(workspaceId!, id, { priority: promotePriority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['idea', workspaceId, id] });
      setShowPromote(false);
    },
    onError: (err) => {
      const detail = (err as any)?.response?.data?.message || (err as Error).message;
      alert(`${t('promoteFailed')}: ${detail}`);
    },
  });

  if (wsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground" />
      <h2 className="mb-2 text-xl font-semibold">{t('noWorkspaceTitle')}</h2>
    </div>
  );
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-4 w-96" /><Skeleton className="h-48 w-full" /></div>;
  if (!idea) return <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground"><Lightbulb className="h-12 w-12" /><p>{t('notFound')}</p></div>;

  const tabs = [
    { id: 'details', label: tt('details') }, { id: 'comments', label: tt('comments'), badge: commentTotal || undefined },
    { id: 'history', label: tt('history') },
    { id: 'relations', label: tt('relations'), badge: relationData?.length },
    { id: 'github', label: tt('github') },
    { id: 'time', label: tt('time') }, { id: 'todo', label: tt('todo'), badge: todoTotal || undefined },
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
                <Input value={titleVal} onChange={e => setTitleVal(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') { if (titleVal.trim() && titleVal !== idea.title) updateMutation.mutate({ title: titleVal }); else setEditTitle(false); } if (e.key === 'Escape') setEditTitle(false); }} />
                <Button size="sm" onClick={() => { if (titleVal.trim() && titleVal !== idea.title) updateMutation.mutate({ title: titleVal }); else setEditTitle(false); }}>{c('save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditTitle(false)}>{c('cancel')}</Button>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm font-medium">{idea.title}</span>
                <Button variant="ghost" size="sm" onClick={() => { setTitleVal(idea.title); setEditTitle(true); }}>{c('edit')}</Button>
                <ShareButton workspaceId={workspaceId} entityType="IDEA" entityId={id} />
              </div>
            )}
          </div>

          {/* Description */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('description')}</span>
            {editDesc ? (
              <div className="flex flex-1 flex-col gap-2">
                <textarea value={descVal} onChange={e => setDescVal(e.target.value)}
                  className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" autoFocus
                  onKeyDown={e => { if (e.key === 'Escape') setEditDesc(false); }} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { if (descVal !== (idea.description || '')) updateMutation.mutate({ description: descVal || undefined }); else setEditDesc(false); }}>{c('save')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditDesc(false)}>{c('cancel')}</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-between">
                <span className="text-sm text-muted-foreground whitespace-pre-wrap">{idea.description || td('noDescription')}</span>
                <Button variant="ghost" size="sm" onClick={() => { setDescVal(idea.description || ''); setEditDesc(true); }}>{c('edit')}</Button>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground">{c('status')}</span>
            <select className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={idea.status} onChange={e => updateMutation.mutate({ status: e.target.value })}>
              {IDEA_STATUS_VALUES.map((v) => <option key={v} value={v}>{tStatus(`IDEA_${v}`)}</option>)}
            </select>
            <Badge variant="secondary" className={getStatusBadgeClasses('IDEA', idea.status)}>{tStatus(`IDEA_${idea.status}`) || idea.status}</Badge>
          </div>

          {/* Assignee */}
          <div className="flex items-center gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{c('owner')}</span>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={idea.assignee?.id || ''}
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
                tags={(idea as any).tags ?? []}
                onChange={(tags) => updateMutation.mutate({ tags } as any)}
              />
            </div>
          </div>

          {/* Creator & Dates */}
          <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <span className="w-20 shrink-0">{td('creator')}</span>
            <span>{idea.createdBy?.name || idea.createdBy?.email}</span>
            <span className="ml-4">· {formatDateTime(idea.createdAt)}</span>
            {idea.updatedAt !== idea.createdAt && <span className="ml-2">({td('updated')}: {formatDateTime(idea.updatedAt)})</span>}
          </div>

          {/* Operation area: promote + file upload + log work */}
          <div className="flex items-start gap-3 py-3">
            <span className="w-20 shrink-0 text-sm text-muted-foreground pt-1">{td('operations')}</span>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {!showPromote ? (
                  <Button size="sm" variant="outline" onClick={() => setShowPromote(true)}>
                    <ArrowUp className="mr-1 h-3 w-3 text-green-600" />{t('promoteToFeature')}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <select className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      value={promotePriority} onChange={e => setPromotePriority(e.target.value)}>
                      <option value="P0">P0 - {td('priorityCritical')}</option>
                      <option value="P1">P1 - {td('priorityHigh')}</option>
                      <option value="P2">P2 - {td('priorityMedium')}</option>
                      <option value="P3">P3 - {td('priorityLow')}</option>
                    </select>
                    <Button size="sm" onClick={() => promoteMutation.mutate()} disabled={promoteMutation.isPending}>
                      {promoteMutation.isPending ? t('promoting') : t('confirmPromote')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowPromote(false)}>{c('cancel')}</Button>
                  </div>
                )}
                <FileUpload workspaceId={workspaceId} entityType="IDEA" entityId={id} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ),
    comments: <CommentSection workspaceId={workspaceId} entityType="IDEA" entityId={id} />,
    history: <HistoryTimeline workspaceId={workspaceId} entityType="IDEA" entityId={id} />,
    relations: <RelationsPanel workspaceId={workspaceId} entityType="IDEA" entityId={id} entityTitle={idea.title} />,
    github: (
      <GithubLinksSection workspaceId={workspaceId} entityType="IDEA" entityId={id} />
    ),
    time: <TimeEntryList workspaceId={workspaceId} entityType="IDEA" entityId={id} />,
    todo: <TodoList workspaceId={workspaceId} ideaId={id} members={members} />,
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          {idea.code && (
            <Badge variant="outline" className="font-mono text-xs tracking-wider">{idea.code}</Badge>
          )}
          {/* 2026-08-14：状态下拉移至编号右侧 */}
          <select
            className="inline-flex h-6 items-center rounded-md border border-input bg-transparent px-1.5 text-xs font-medium"
            value={idea.status}
            onChange={(e) => updateMutation.mutate({ status: e.target.value })}
          >
            {IDEA_STATUS_VALUES.map((v) => (
              <option key={v} value={v}>{tStatus(`IDEA_${v}`) || v}</option>
            ))}
          </select>
          <VoteButton wsId={workspaceId!} entityType="IDEA" entityId={id} count={(idea as any).voteCount ?? 0} invalidateKeys={['idea', workspaceId, id]} />
          <ScoreEditor wsId={workspaceId!} entityType="IDEA" entityId={id} score={(idea as any).score ?? null} invalidateKeys={['idea', workspaceId, id]} />
          <h1 className="text-2xl font-bold tracking-tight">{idea.title}</h1>
        </div>
        <div className="text-muted-foreground text-sm">
          <Badge variant="secondary" className={getStatusBadgeClasses('IDEA', idea.status)}>{tStatus(`IDEA_${idea.status}`) || idea.status}</Badge>
          {(idea.assignee?.name || idea.assigneeName) && <span className="ml-2">{c('owner')}: {idea.assignee?.name || idea.assigneeName}</span>}
          <span className="ml-2">{idea.createdBy?.name || idea.createdBy?.email} · {formatDate(idea.createdAt)}</span>
        </div>
      </div>
      <EntityTabs tabs={tabs} defaultTab="details" tabContents={tabContents} />
    </div>
  );
}
