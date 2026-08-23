'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { storyApi, featureApi, releaseApi, teamsApi, sprintsApi, workflowApi } from '@/lib/api-client';
import { resolveAssigneeAction } from '@/lib/assignee-utils';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {Columns3, Plus, LayoutGrid, Calendar, List, Trash2, User, GitBranch, Loader2, Rows3 } from 'lucide-react';
import StoryCard from './story-card';
import KanbanColumn from './kanban-column';
import { HoursCompareBar } from '@/components/hours-compare-bar';
import BrowseModeSwitcher from '@/components/browse-mode-switcher';
import ExportButton from '@/components/export-button';
import { useWorkspace } from '@/hooks/use-workspace';
import { STATUS_COLORS, getStatusBadgeClasses } from '@/lib/status-colors';
import { formatDate } from '@/lib/date-utils';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { STORY_STATUSES as STORY_STATUSES_ALL } from '@/lib/entity-statuses';
import { STORY_PRIORITY_COLORS, STORY_PRIORITY_LABELS } from '@/lib/story-priority';

type StoryStatus = (typeof STORY_STATUSES_ALL)[number];
type ViewMode = 'list' | 'status' | 'release' | 'assignee' | 'sprint' | 'lane';

interface ColumnDef {
  id: StoryStatus;
  title: string;
}

const STATUS_COLUMN_IDS: StoryStatus[] = STORY_STATUSES_ALL.filter(
  (s) => s !== 'BLOCKED',
) as StoryStatus[];

const UNASSIGNED_RELEASE = '__unassigned_release__';
const UNASSIGNED_SPRINT = '__unassigned_sprint__';
const UNASSIGNED_COL = '__unassigned_assignee__';

// 泳道视图单元格（P2-⑫）：一个负责人 × 一个状态的 droppable 卡片区
function LaneCell({
  id,
  stories,
  className,
  wipLimit,
  sprintNameOf,
  onDelete,
}: {
  id: string;
  stories: any[];
  className?: string;
  wipLimit?: number | null;
  sprintNameOf: (sprintId: string | null | undefined) => string | undefined;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const wipOver = wipLimit != null && stories.length > wipLimit;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[120px] flex-col gap-2 rounded-lg border-2 p-2',
        isOver ? 'border-primary ring-2 ring-primary/20' : 'border-transparent',
        className,
      )}
    >
      {wipOver && (
        <div className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
          {stories.length}/{wipLimit} WIP
        </div>
      )}
      <SortableContext items={stories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {stories.map((story) => (
          <StoryCard key={story.id} story={story} sprintName={sprintNameOf(story.sprintId)} onDelete={onDelete} />
        ))}
      </SortableContext>
    </div>
  );
}

export default function StoriesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('assignee');
  const [statusFilter, setStatusFilter] = useState('');
  const [featureFilter, setFeatureFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [newFeatureId, setNewFeatureId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTeamId, setNewTeamId] = useState('');
  const [newSprintId, setNewSprintId] = useState('');
  const t = useTranslations('story');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const currentUser = useAuthStore((s) => s.user);

  const { data: featuresData } = useQuery({
    queryKey: ['features', workspaceId],
    queryFn: () => featureApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const features = featuresData?.items ?? [];

  const { data: teamsData } = useQuery({
    queryKey: ['teams', workspaceId],
    queryFn: () => teamsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const teams = teamsData ?? [];

  const { data: sprintsData } = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => sprintsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const sprints = sprintsData ?? [];

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const { data: storiesData, isLoading } = useQuery({
    queryKey: ['stories', workspaceId],
    // 2026-08-14：看板只显示顶级 Story（后端默认过滤 parentId=null），
    // 子任务仅从 story 详情页抽屉访问（subtasks-section 显式传 parentId）
    queryFn: () => storyApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const stories = storiesData?.items ?? [];

  // Story 工作流（读取各状态的 WIP 上限）
  const { data: storyWorkflow } = useQuery({
    queryKey: ['workflow', workspaceId, 'STORY'],
    queryFn: () => workflowApi.byEntity(workspaceId!, 'STORY').then((r) => r.data),
    enabled: !!workspaceId,
  });
  const wipLimitOf = (statusId: string): number | null => {
    const st = storyWorkflow?.statuses?.find((s) => s.name === statusId || s.name === `STORY_${statusId}`);
    return st?.wipLimit ?? null;
  };

  // 筛选后的数据（状态 + 功能，清单模式使用）
  const filteredStories = useMemo(() => {
    return stories.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (featureFilter && s.featureId !== featureFilter) return false;
      return true;
    });
  }, [stories, statusFilter, featureFilter]);

  // 勾选/全选逻辑
  const allChecked = filteredStories.length > 0 && filteredStories.every((s) => selectedIds.has(s.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filteredStories.forEach((s) => next.delete(s.id));
      } else {
        filteredStories.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportHeaders = [c('workspace'), c('code'), c('title'), c('status'), c('priority'), t('feature'), t('releaseLabel'), t('owner'), c('creator'), c('createdAt')];
  const exportRows = () =>
    filteredStories.map((s) => [
      workspace?.name || '',
      s.code || '',
      s.title,
      tStatus(`STORY_${s.status}`) || s.status,
      s.priority,
      s.feature?.title || '',
      s.release ? (s.release.version ? `${s.release.name} (${s.release.version})` : s.release.name) : '',
      s.assignee?.name || '',
      s.createdBy?.name || s.createdBy?.email || '',
      formatDate(s.createdAt),
    ]);

  const updateMutation = useMutation({
    mutationFn: ({ id, status, sprintId }: { id: string; status?: string; sprintId?: string | null }) =>
      storyApi.update(workspaceId!, id, { status, sprintId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] }),
  });

  const createStoryMutation = useMutation({
    mutationFn: (data: { featureId: string; title: string; description?: string; teamId?: string; sprintId?: string }) =>
      storyApi.create(workspaceId!, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] });
      setShowCreate(false);
      setNewFeatureId('');
      setNewTitle('');
      setNewDescription('');
    },
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      storyApi.update(workspaceId!, id, { assigneeId }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => storyApi.remove(workspaceId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // 按状态分组
  const getColumnStoriesByStatus = (status: string) =>
    stories.filter((s) => s.status === status);

  // 按负责人分组列：未分配 → 当前登录用户 → 其他按名字母排序
  const assigneeColumns = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    stories.forEach((s) => {
      const a = s.assignee;
      if (a && a.id) map.set(a.id, { id: a.id, name: a.name || '', email: a.email });
    });
    const me = currentUser?.id;
    const mine = me && map.has(me) ? map.get(me)! : null;
    const others = Array.from(map.values())
      .filter((u) => u.id !== me)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return { mine, others };
  }, [stories, currentUser]);

  const getColumnStoriesByAssignee = (userId: string | null) =>
    stories.filter((s) => (s.assignee?.id ?? null) === userId);

  // 泳道视图（P2-⑫）：负责人为泳道，泳道内是状态列；未分配为独立泳道
  const laneAssignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    stories.forEach((s) => {
      const a = s.assignee;
      if (a && a.id) map.set(a.id, { id: a.id, name: a.name || '', email: a.email });
    });
    const list = Array.from(map.values()).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return [{ id: UNASSIGNED_COL, name: t('unassigned'), email: '' }, ...list];
  }, [stories, t]);

  const getStoriesInLaneAndStatus = (assigneeId: string | null, status: string) =>
    stories.filter((s) => s.status === status && (s.assignee?.id ?? null) === assigneeId);

  // 按发布周期分组
  const releaseColumns = useMemo(() => {
    const activeReleases = releases
      .filter((r) => r.status !== 'CLOSED')
      .sort((a, b) => (a.version || '').localeCompare(b.version || '', undefined, { numeric: true }));

    const buckets: Array<{ id: string; title: string; releaseId: string | null }> = activeReleases.map((r) => ({
      id: r.id,
      title: `${r.name}${r.version ? ` (${r.version})` : ''}`,
      releaseId: r.id,
    }));
    buckets.push({ id: UNASSIGNED_RELEASE, title: t('unassignedRelease'), releaseId: null });

    return buckets;
  }, [releases, t]);

  const getColumnStoriesByRelease = (releaseId: string | null) => {
    const featureToRelease = new Map<string, string | null>();
    features.forEach((f) => featureToRelease.set(f.id, f.releaseId ?? null));
    return stories.filter((s) => {
      // 优先使用 story 直接绑定的发布周期（fix version），其次回退到所属 feature 的发布周期
      const r = s.releaseId ?? featureToRelease.get(s.featureId) ?? null;
      return r === releaseId;
    });
  };

  const sprintColumns = useMemo(() => {
    const buckets: Array<{ id: string; title: string; sprintId: string | null }> = sprints.map((sp) => ({
      id: sp.id,
      title: sp.name,
      sprintId: sp.id,
    }));
    buckets.push({ id: UNASSIGNED_SPRINT, title: t('backlog'), sprintId: null });
    return buckets;
  }, [sprints, t]);

  const getColumnStoriesBySprint = (sprintId: string | null) => {
    return stories.filter((s) => (s.sprintId ?? null) === sprintId);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const storyId = active.id as string;
    const targetColumnId = over.id as string;

    // 按负责人视图：拖到某用户列 = 改负责人；拖到未分配列 = 清空负责人
    if (viewMode === 'assignee') {
      const story = stories.find((s) => s.id === storyId);
      if (!story) return;
      const isUnassignedCol = targetColumnId === UNASSIGNED_COL;
      const isUserCol = assigneeColumns.mine?.id === targetColumnId || assigneeColumns.others.some((u) => u.id === targetColumnId);
      if (!isUnassignedCol && !isUserCol) {
        showToast(c('invalidDrop'));
        return;
      }
      const nextAssigneeId = resolveAssigneeAction(story.assignee?.id, isUnassignedCol ? null : targetColumnId);
      if (nextAssigneeId !== undefined) updateAssigneeMutation.mutate({ id: storyId, assigneeId: nextAssigneeId });
      return;
    }

    // 迭代视图：拖到 Sprint 列 = 加入该迭代；拖到 Backlog 列 = 移出迭代
    if (viewMode === 'sprint') {
      const story = stories.find((st) => st.id === storyId);
      const isBacklogCol = targetColumnId === UNASSIGNED_SPRINT;
      const isSprintCol = sprints.some((sp) => sp.id === targetColumnId);
      if (!isBacklogCol && !isSprintCol) {
        showToast(c('invalidDrop'));
        return;
      }
      const nextSprintId = isBacklogCol ? null : targetColumnId;
      if (story && story.sprintId !== nextSprintId) {
        updateMutation.mutate({ id: storyId, sprintId: nextSprintId });
      }
      return;
    }

    // 泳道视图：目标列 id 形如 lane-{assigneeId}-{status}
    if (viewMode === 'lane') {
      const story = stories.find((st) => st.id === storyId);
      if (!story) return;
      const m = /^lane-(.+?)-([A-Z_]+)$/.exec(targetColumnId);
      if (!m) {
        showToast(c('invalidDrop'));
        return;
      }
      const [, laneAssigneeId, laneStatus] = m;
      const targetAssigneeId = laneAssigneeId === UNASSIGNED_COL ? null : laneAssigneeId;
      const changes: Record<string, unknown> = {};
      if (story.status !== laneStatus) changes.status = laneStatus;
      if ((story.assignee?.id ?? null) !== targetAssigneeId) changes.assigneeId = targetAssigneeId;
      if (Object.keys(changes).length > 0) {
        updateMutation.mutate({ id: storyId, ...changes } as any);
      }
      return;
    }

    if (viewMode !== 'status') return; // 发布周期视图只读
    const story = stories.find((s) => s.id === storyId);
    if (!STATUS_COLUMN_IDS.some((c) => c === targetColumnId)) {
      showToast(c('invalidDrop'));
      return;
    }
    if (story && story.status !== targetColumnId) {
      updateMutation.mutate({ id: storyId, status: targetColumnId });
    }
  };

  const activeStory = activeId ? stories.find((s) => s.id === activeId) : null;

  // 首帧工作区数据未加载完成时显示加载态，避免闪现「未选择工作区」
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
        <Button onClick={() => (window.location.href = '/')}>{t('goHomeCreate')}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('boardTitle')}</h1>
          <p className="text-muted-foreground">
            {viewMode === 'status' ? t('statusViewHint') : viewMode === 'release' ? t('releaseViewHint') : viewMode === 'sprint' ? t('sprintViewHint') : t('assigneeViewHint')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 视图切换 */}
          <BrowseModeSwitcher
            value={viewMode}
            onChange={(m) => setViewMode(m as ViewMode)}
            options={[
              { id: 'list', label: c('list'), icon: <List className="h-3.5 w-3.5" /> },
              { id: 'status', label: c('byStatus'), icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              { id: 'release', label: c('byRelease'), icon: <Calendar className="h-3.5 w-3.5" /> },
              { id: 'sprint', label: c('bySprint'), icon: <GitBranch className="h-3.5 w-3.5" /> },
              { id: 'assignee', label: c('byAssignee'), icon: <User className="h-3.5 w-3.5" /> },
              { id: 'lane', label: t('byLane'), icon: <Rows3 className="h-3.5 w-3.5" /> },
            ]}
          />
          {viewMode === 'list' && (
            <ExportButton
              filename="stories"
              headers={exportHeaders}
              rows={exportRows()}
              selectedIds={selectedIds}
              rowIds={filteredStories.map((s) => s.id)}
              disabled={filteredStories.length === 0}
              pdfTitle={t('boardTitle')}
            />
          )}
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1 h-4 w-4" /> {t('newStory')}
          </Button>
          <Button variant="outline" onClick={() => router.push('/features')}>
            {t('createFromFeature')}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('newStory')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={newFeatureId}
              onChange={(e) => setNewFeatureId(e.target.value)}
            >
              <option value="">{t('chooseFeature')}</option>
              {features.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={newTeamId}
              onChange={(e) => setNewTeamId(e.target.value)}
            >
              <option value="">{t('chooseTeam')}</option>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>{tm.name}</option>
              ))}
            </select>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={newSprintId}
              onChange={(e) => setNewSprintId(e.target.value)}
            >
              <option value="">{t('chooseSprint')}</option>
              {sprints.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
            <Input
              placeholder={t('titlePlaceholder')}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <textarea
              placeholder={t('descPlaceholder')}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => createStoryMutation.mutate({ featureId: newFeatureId, title: newTitle, description: newDescription || undefined, teamId: newTeamId || undefined, sprintId: newSprintId || undefined })}
                disabled={!newTitle || !newFeatureId || createStoryMutation.isPending}
              >
                {createStoryMutation.isPending ? c('creating') : c('create')}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{c('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-full w-[336px] shrink-0 rounded-lg" />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{c('status')}: {c('all')}</option>
              {STATUS_COLUMN_IDS.map((s) => (
                <option key={s} value={s}>{tStatus(`STORY_${s}`) || s}</option>
              ))}
            </select>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
            >
              <option value="">{t('feature')}: {c('all')}</option>
              {features.map((f) => (
                <option key={f.id} value={f.id}>{f.title}</option>
              ))}
            </select>
          </div>

          {filteredStories.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Columns3 className="h-12 w-12" />
              <p>{t('noStories')}</p>
              <Button variant="outline" size="sm" onClick={() => router.push('/features')}>
                {t('createFromFeature')}
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer accent-primary"
                        checked={allChecked}
                        onChange={toggleAll}
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">{c('workspace')}</th>
                    <th className="px-3 py-2 font-medium">{c('code')}</th>
                    <th className="px-3 py-2 font-medium">{c('title')}</th>
                    <th className="px-3 py-2 font-medium">{c('status')}</th>
                    <th className="px-3 py-2 font-medium">{c('priority')}</th>
                    {/* 2026-08-14：工时比对列（预计蓝 / 实际绿） */}
                    <th className="px-3 py-2 font-medium">{t('hoursCompare')}</th>
                    <th className="px-3 py-2 font-medium">{t('feature')}</th>
                    <th className="px-3 py-2 font-medium">{t('releaseLabel')}</th>
                    <th className="px-3 py-2 font-medium">{t('owner')}</th>
                    <th className="px-3 py-2 font-medium">{c('creator')}</th>
                    <th className="px-3 py-2 font-medium">{c('createdAt')}</th>
                    <th className="px-3 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStories.map((story) => (
                    <tr
                      key={story.id}
                      className="group cursor-pointer border-b last:border-0 hover:bg-accent/40 transition-colors"
                      onClick={() => router.push(`/stories/${story.id}`)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer accent-primary"
                          checked={selectedIds.has(story.id)}
                          onChange={() => toggleOne(story.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{workspace?.name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{story.code || '—'}</td>
                      <td className="px-3 py-2 font-medium">{story.title}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge variant="secondary" className={cn('text-xs', getStatusBadgeClasses('STORY', story.status))}>
                          {tStatus(`STORY_${story.status}`) || story.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={cn('text-xs', STORY_PRIORITY_COLORS[story.priority] || '')}
                          title={STORY_PRIORITY_LABELS[story.priority] ?? story.priority}
                        >
                          {story.priority}
                        </Badge>
                      </td>
                      {/* 工时比对条：蓝=预计 estimateHours，绿=实际 loggedHours，悬浮显具体小时 */}
                      <td className="px-3 py-2">
                        <HoursCompareBar estimated={story.estimateHours ?? 0} logged={story.loggedHours ?? 0} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{story.feature?.title || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {story.release ? (story.release.version ? `${story.release.name} (${story.release.version})` : story.release.name) : '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{story.assignee?.name || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{story.createdBy?.name || story.createdBy?.email || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(story.createdAt)}</td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(story.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : viewMode === 'status' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
              {STATUS_COLUMN_IDS.map((id) => {
                const colors = STATUS_COLORS.STORY[id] ?? STATUS_COLORS.STORY.OPEN;
                return (
                  <KanbanColumn
                    key={id}
                    id={id}
                    title={tStatus(`STORY_${id}`)}
                    className={`${colors.bg} ${colors.border}`}
                    count={getColumnStoriesByStatus(id).length}
                    wipLimit={wipLimitOf(id)}
                  >
                    <SortableContext
                      items={getColumnStoriesByStatus(id).map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {getColumnStoriesByStatus(id).map((story) => (
                        <StoryCard key={story.id} story={story} sprintName={sprints.find((sp) => sp.id === story.sprintId)?.name} onDelete={(sid) => deleteMutation.mutate(sid)} />
                      ))}
                    </SortableContext>
                  </KanbanColumn>
                );
              })}
            </div>
        </DndContext>
      ) : viewMode === 'release' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
            {releaseColumns.map((col) => {
                const colStories = getColumnStoriesByRelease(col.releaseId);
                const isUnassigned = col.id === UNASSIGNED_RELEASE;
                return (
                  <KanbanColumn
                    key={col.id}
                    id={col.id}
                    title={col.title}
                    className={cn(
                      isUnassigned
                        ? 'bg-gray-50/50 border-gray-200'
                        : 'bg-blue-50/50 border-blue-200'
                    )}
                    count={colStories.length}
                  >
                    <SortableContext
                      items={colStories.map((s) => s.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {colStories.map((story) => (
                        <StoryCard key={story.id} story={story} sprintName={sprints.find((sp) => sp.id === story.sprintId)?.name} onDelete={(sid) => deleteMutation.mutate(sid)} />
                      ))}
                    </SortableContext>
                  </KanbanColumn>
                );
              })}
          </div>
        </DndContext>
      ) : viewMode === 'sprint' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
            {sprintColumns.map((col) => {
              const colStories = getColumnStoriesBySprint(col.sprintId);
              const isBacklog = col.id === UNASSIGNED_SPRINT;
              const sp = sprints.find((x) => x.id === col.id);
              const progress = sp && (sp.storyCount ?? 0) > 0 ? Math.round(((sp.doneCount ?? 0) / (sp.storyCount ?? 1)) * 100) : 0;
              return (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  title={col.title}
                  className={cn(
                    isBacklog
                      ? 'bg-gray-50/50 border-gray-200'
                      : 'bg-violet-50/50 border-violet-200'
                  )}
                  count={colStories.length}
                >
                  {!isBacklog && sp && (sp.storyCount ?? 0) > 0 && (
                    <div className="mb-2">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                        <div className="h-full rounded-full bg-violet-500" style={{ width: progress + '%' }} />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">{t('sprintProgress', { done: sp.doneCount ?? 0, total: sp.storyCount ?? 0 })}</p>
                    </div>
                  )}
                  <SortableContext
                    items={colStories.map((x) => x.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {colStories.map((story) => (
                      <StoryCard key={story.id} story={story} sprintName={sprints.find((sp) => sp.id === story.sprintId)?.name} onDelete={(sid) => deleteMutation.mutate(sid)} />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>
        </DndContext>
      ) : viewMode === 'lane' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="min-h-0 flex-1 overflow-x-auto pb-4">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `150px repeat(${STATUS_COLUMN_IDS.length}, minmax(200px, 1fr))`,
              }}
            >
              {/* 表头行：空角 + 状态列标题（sticky 顶部） */}
              <div className="sticky left-0 z-20 bg-background px-2 py-1.5 text-sm font-medium text-muted-foreground">
                {t('laneAssignee')}
              </div>
              {STATUS_COLUMN_IDS.map((st) => {
                const colors = STATUS_COLORS.STORY[st] ?? STATUS_COLORS.STORY.OPEN;
                return (
                  <div
                    key={`h-${st}`}
                    className={`flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium ${colors.bg} ${colors.border}`}
                  >
                    {tStatus(`STORY_${st}`)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {laneAssignees.reduce(
                        (n, lane) => n + getStoriesInLaneAndStatus(lane.id === UNASSIGNED_COL ? null : lane.id, st).length,
                        0,
                      )}
                    </span>
                  </div>
                );
              })}

              {/* 泳道行：负责人（sticky 左侧）+ 各状态单元格 */}
              {laneAssignees.map((lane) => (
                <div key={`lane-row-${lane.id}`} className="contents">
                  <div className="sticky left-0 z-10 flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm font-medium">
                    {lane.name || lane.email || t('unassigned')}
                    <span className="text-xs font-normal text-muted-foreground">
                      {STATUS_COLUMN_IDS.reduce(
                        (n, st) => n + getStoriesInLaneAndStatus(lane.id === UNASSIGNED_COL ? null : lane.id, st).length,
                        0,
                      )}
                    </span>
                  </div>
                  {STATUS_COLUMN_IDS.map((st) => {
                    const colors = STATUS_COLORS.STORY[st] ?? STATUS_COLORS.STORY.OPEN;
                    const laneId = `lane-${lane.id}-${st}`;
                    const laneStories = getStoriesInLaneAndStatus(lane.id === UNASSIGNED_COL ? null : lane.id, st);
                    return (
                      <LaneCell
                        key={laneId}
                        id={laneId}
                        stories={laneStories}
                        className={`${colors.bg} ${colors.border}`}
                        wipLimit={wipLimitOf(st)}
                        sprintNameOf={(sid) => sprints.find((sp) => sp.id === sid)?.name}
                        onDelete={(sid) => deleteMutation.mutate(sid)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </DndContext>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
            {/* 未分配负责人 */}
            <KanbanColumn
              id={UNASSIGNED_COL}
              title={t('unassigned')}
              className="bg-gray-50/50 border-gray-200"
              count={getColumnStoriesByAssignee(null).length}
            >
              <SortableContext
                items={getColumnStoriesByAssignee(null).map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {getColumnStoriesByAssignee(null).map((story) => (
                  <StoryCard key={story.id} story={story} sprintName={sprints.find((sp) => sp.id === story.sprintId)?.name} onDelete={(sid) => deleteMutation.mutate(sid)} />
                ))}
              </SortableContext>
            </KanbanColumn>

            {/* 当前登录用户 */}
            {assigneeColumns.mine && (
              <KanbanColumn
                id={assigneeColumns.mine.id}
                title={assigneeColumns.mine.name || assigneeColumns.mine.email}
                className="bg-blue-50/50 border-blue-200"
                count={getColumnStoriesByAssignee(assigneeColumns.mine.id).length}
              >
                <SortableContext
                  items={getColumnStoriesByAssignee(assigneeColumns.mine.id).map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnStoriesByAssignee(assigneeColumns.mine.id).map((story) => (
                    <StoryCard key={story.id} story={story} sprintName={sprints.find((sp) => sp.id === story.sprintId)?.name} onDelete={(sid) => deleteMutation.mutate(sid)} />
                  ))}
                </SortableContext>
              </KanbanColumn>
            )}

            {/* 其他用户（按名字母排序） */}
            {assigneeColumns.others.map((u) => (
              <KanbanColumn
                key={u.id}
                id={u.id}
                title={u.name || u.email}
                className="bg-green-50/50 border-green-200"
                count={getColumnStoriesByAssignee(u.id).length}
              >
                <SortableContext
                  items={getColumnStoriesByAssignee(u.id).map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnStoriesByAssignee(u.id).map((story) => (
                    <StoryCard key={story.id} story={story} sprintName={sprints.find((sp) => sp.id === story.sprintId)?.name} onDelete={(sid) => deleteMutation.mutate(sid)} />
                  ))}
                </SortableContext>
              </KanbanColumn>
            ))}
          </div>

          <DragOverlay>
            {activeStory ? (
              <Card className="w-72 rotate-3 shadow-lg opacity-90">
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{activeStory.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn('text-xs', STORY_PRIORITY_COLORS[activeStory.priority] || '')}
                      title={STORY_PRIORITY_LABELS[activeStory.priority] ?? activeStory.priority}
                    >
                      {activeStory.priority}
                    </Badge>
                    {activeStory.assignee && (
                      <span className="text-xs text-muted-foreground">{activeStory.assignee.name}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
