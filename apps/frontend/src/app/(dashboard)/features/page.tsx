'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { featureApi, releaseApi, themesApi } from '@/lib/api-client';
import { ENTITY_PRIORITY_COLORS, ENTITY_PRIORITY_LABELS } from '@/lib/entity-priority';
import { resolveAssigneeAction } from '@/lib/assignee-utils';
import { FEATURE_STATUSES } from '@/lib/entity-statuses';
import { showToast } from '@/components/simple-toast';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import BrowseModeSwitcher from '@/components/browse-mode-switcher';
import ExportButton from '@/components/export-button';
import {Layers, Plus, List, LayoutGrid, Calendar, User, Loader2 } from 'lucide-react';
import FeatureCard from './feature-card';
import KanbanColumn from '@/app/(dashboard)/stories/kanban-column';
import { useWorkspace } from '@/hooks/use-workspace';
import { STATUS_COLORS, getStatusBadgeClasses, getStatusClasses } from '@/lib/status-colors';
import { formatDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';

const UNASSIGNED_COL = '__unassigned__';

type ViewMode = 'list' | 'status' | 'release' | 'assignee' | 'epic';

const FEATURE_STATUS_COLUMN_IDS = FEATURE_STATUSES;

export default function FeaturesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRelId, setNewRelId] = useState('');
  const [priority, setPriority] = useState('P2');
  const [newParentId, setNewParentId] = useState('');
  const [isEpic, setIsEpic] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('assignee');
  const [statusFilter, setStatusFilter] = useState('');
  const [releaseFilter, setReleaseFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [themeFilter, setThemeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const t = useTranslations('feature');
  const td = useTranslations('detail');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const tVotes = useTranslations('votes');
  const tScores = useTranslations('scores');
  const tThemes = useTranslations('themes');
  const currentUser = useAuthStore((s) => s.user);

  const { data: featuresData, isLoading } = useQuery({
    queryKey: ['features', workspaceId, sortBy, themeFilter],
    queryFn: () => featureApi.list(workspaceId!, { sortBy: sortBy || undefined, themeId: themeFilter || undefined }).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const features = featuresData?.items ?? [];

  const { data: themesData } = useQuery({
    queryKey: ['themes', workspaceId],
    queryFn: () => themesApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const themes = themesData ?? [];

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  // Columns: non-closed releases sorted by version ascending, plus "Unassigned"
  const columns = useMemo(() => {
    const sorted = [...releases]
      .filter((r) => r.status !== 'CLOSED')
      .sort((a, b) => (a.version || '').localeCompare(b.version || '', undefined, { numeric: true }));
    return sorted;
  }, [releases]);

  const createMutation = useMutation({
    mutationFn: () =>
      featureApi.create(workspaceId!, { title, description: newDescription || undefined, releaseId: newRelId || undefined, priority, parentFeatureId: newParentId || undefined, isEpic }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features', workspaceId] });
      setShowCreate(false);
      setTitle('');
      setNewDescription('');
      setNewRelId('');
      setNewParentId('');
      setIsEpic(false);
      setPriority('P2');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => featureApi.remove(workspaceId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['features', workspaceId] }),
  });

  const updateReleaseMutation = useMutation({
    mutationFn: ({ id, releaseId }: { id: string; releaseId: string | null }) =>
      featureApi.update(workspaceId!, id, { releaseId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['features', workspaceId] });
    },
  });

  const updateParentMutation = useMutation({
    mutationFn: ({ id, parentFeatureId }: { id: string; parentFeatureId: string | null }) =>
      featureApi.update(workspaceId!, id, { parentFeatureId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['features', workspaceId] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      featureApi.update(workspaceId!, id, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['features', workspaceId] }),
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      featureApi.update(workspaceId!, id, { assigneeId }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['features', workspaceId] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // 按负责人分组列：未分配 → 当前登录用户 → 其他按名字母排序
  // Epic 分组（B 方案：显式标记 isEpic 的 Feature 才是 Epic；已有普通 Feature 保持原样）
  const epicColumns = useMemo(() => {
    const epics = features.filter((f) => f.isEpic);
    return [{ id: UNASSIGNED_COL, title: t('epicUngrouped'), parentId: null as string | null }, ...epics.map((e) => ({ id: e.id, title: e.title, parentId: e.id }))];
  }, [features, t]);

  const getColumnFeaturesByEpic = (parentId: string | null) => {
    if (!parentId) return features.filter((f) => !f.isEpic && !f.parentFeatureId);
    return features.filter((f) => f.parentFeatureId === parentId);
  };

  const assigneeColumns = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    features.forEach((f) => {
      const a = f.assignee;
      if (a && a.id) map.set(a.id, { id: a.id, name: a.name || '', email: a.email });
    });
    const me = currentUser?.id;
    const mine = me && map.has(me) ? map.get(me)! : null;
    const others = Array.from(map.values())
      .filter((u) => u.id !== me)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return { mine, others };
  }, [features, currentUser]);

  const getColumnFeaturesByAssignee = (userId: string | null) =>
    features.filter((f) => (f.assignee?.id ?? null) === userId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const featureId = active.id as string;
    const targetColId = over.id as string;
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return;

    // Epic 视图：拖到 Epic 列 = 挂到该父 Feature；拖到未分组 = 清空父级
    if (viewMode === 'epic') {
      const isEpicCol = epicColumns.some((c) => c.id === targetColId);
      const isUngrouped = targetColId === UNASSIGNED_COL;
      if (!isEpicCol && !isUngrouped) {
        showToast(c('invalidDrop'));
        return;
      }
      const nextParentId = isUngrouped ? null : targetColId;
      if ((feature.parentFeatureId ?? null) !== nextParentId) {
        updateParentMutation.mutate({ id: featureId, parentFeatureId: nextParentId });
      }
      return;
    }

    // 按负责人视图：拖到某用户列 = 改负责人；拖到未分配列 = 清空负责人
    if (viewMode === 'assignee') {
      const isUnassignedCol = targetColId === UNASSIGNED_COL;
      const isUserCol = assigneeColumns.mine?.id === targetColId || assigneeColumns.others.some((u) => u.id === targetColId);
      if (!isUnassignedCol && !isUserCol) {
        showToast(c('invalidDrop'));
        return;
      }
      const nextAssigneeId = resolveAssigneeAction(feature.assignee?.id, isUnassignedCol ? null : targetColId);
      if (nextAssigneeId !== undefined) updateAssigneeMutation.mutate({ id: featureId, assigneeId: nextAssigneeId });
      return;
    }

    if (viewMode === 'status') {
      // 按状态视图：拖拽改状态
      if (!FEATURE_STATUS_COLUMN_IDS.some((s) => s === targetColId)) {
        showToast(c('invalidDrop'));
        return;
      }
      if (feature.status !== targetColId) {
        updateStatusMutation.mutate({ id: featureId, status: targetColId });
      }
      return;
    }

    // 按发布周期视图：拖拽改 release
    let targetReleaseId: string | null = null;

    if (targetColId === UNASSIGNED_COL) {
      targetReleaseId = null;
    } else if (columns.some((cl) => cl.id === targetColId)) {
      targetReleaseId = targetColId;
    } else {
      // Dropped on another feature — find its release
      const overFeature = features.find((f) => f.id === targetColId);
      if (overFeature) {
        targetReleaseId = overFeature.releaseId ?? null;
      }
    }

    if (targetReleaseId !== undefined && (feature.releaseId ?? null) !== targetReleaseId) {
      updateReleaseMutation.mutate({ id: featureId, releaseId: targetReleaseId });
    }
  };

  const getColumnFeatures = (releaseId: string | null) =>
    features.filter((f) => (f.releaseId ?? null) === releaseId) ?? [];

  const getColumnFeaturesByStatus = (status: string) =>
    features.filter((f) => f.status === status);

  const releaseName = (releaseId?: string | null) => {
    const r = releases.find((rel) => rel.id === releaseId);
    return r ? `${r.name}${r.version ? ` (${r.version})` : ''}` : '—';
  };

  // 筛选后的数据（状态 + 发布周期，清单模式使用）
  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (statusFilter && f.status !== statusFilter) return false;
      if (releaseFilter && (f.releaseId ?? '') !== releaseFilter) return false;
      return true;
    });
  }, [features, statusFilter, releaseFilter]);

  // 勾选/全选逻辑
  const allChecked = filteredFeatures.length > 0 && filteredFeatures.every((f) => selectedIds.has(f.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filteredFeatures.forEach((f) => next.delete(f.id));
      } else {
        filteredFeatures.forEach((f) => next.add(f.id));
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

  const exportHeaders = [c('workspace'), c('code'), c('title'), c('status'), c('priority'), c('release'), c('owner'), c('creator'), c('createdAt')];
  const exportRows = () =>
    filteredFeatures.map((f) => [
      workspace?.name || '',
      f.code || '',
      f.title,
      tStatus(`FEATURE_${f.status}`) || f.status,
      f.priority,
      releaseName(f.releaseId),
      f.assignee?.name || f.assigneeName || '',
      f.createdBy?.name || f.createdBy?.email || '',
      formatDate(f.createdAt),
    ]);

  const activeFeature = activeId ? features.find((f) => f.id === activeId) : null;

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
        <Layers className="mb-4 h-12 w-12 text-muted-foreground" />
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
            {viewMode === 'assignee' ? t('assigneeSubtitle') : t('boardSubtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BrowseModeSwitcher
            value={viewMode}
            onChange={(m) => setViewMode(m as ViewMode)}
            options={[
              { id: 'list', label: c('list'), icon: <List className="h-3.5 w-3.5" /> },
              { id: 'status', label: c('byStatus'), icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              { id: 'release', label: c('byRelease'), icon: <Calendar className="h-3.5 w-3.5" /> },
              { id: 'assignee', label: c('byAssignee'), icon: <User className="h-3.5 w-3.5" /> },
              { id: 'epic', label: t('byEpic'), icon: <Layers className="h-3.5 w-3.5" /> },
            ]}
          />
          {viewMode === 'list' && (
            <ExportButton
              filename="features"
              headers={exportHeaders}
              rows={exportRows()}
              selectedIds={selectedIds}
              rowIds={filteredFeatures.map((f) => f.id)}
              disabled={filteredFeatures.length === 0}
              pdfTitle={t('boardTitle')}
            />
          )}
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1 h-4 w-4" /> {t('newFeature')}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('newFeature')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder={t('titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              placeholder={t('descPlaceholder')}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={newRelId}
                onChange={(e) => setNewRelId(e.target.value)}
              >
                <option value="">{t('noRelease')}</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ''}</option>
                ))}
              </select>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
              >
                <option value="">{t('noEpic')}</option>
                {features.filter((f) => f.isEpic).map((f) => (
                  <option key={f.id} value={f.id}>{f.title}</option>
                ))}
              </select>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="P0">P0 - {td('priorityCritical')}</option>
                <option value="P1">P1 - {td('priorityHigh')}</option>
                <option value="P2">P2 - {td('priorityMedium')}</option>
                <option value="P3">P3 - {td('priorityLow')}</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isEpic}
                onChange={(e) => setIsEpic(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-violet-600"
              />
              {t('markAsEpic')}
            </label>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!title}>{t('create')}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{c('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96 w-[336px] shrink-0 rounded-lg" />
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
              {FEATURE_STATUS_COLUMN_IDS.map((s) => (
                <option key={s} value={s}>{tStatus(`FEATURE_${s}`) || s}</option>
              ))}
            </select>
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={releaseFilter}
              onChange={(e) => setReleaseFilter(e.target.value)}
            >
              <option value="">{c('release')}: {c('all')}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ''}</option>
              ))}
            </select>
            {themes.length > 0 && (
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={themeFilter}
                onChange={(e) => setThemeFilter(e.target.value)}
              >
                <option value="">{tThemes('title')}: {tThemes('all')}</option>
                {themes.map((th) => (
                  <option key={th.id} value={th.id}>{th.title}</option>
                ))}
              </select>
            )}
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="">{tScores('sortLatest')}</option>
              <option value="voteCount">{tThemes('sortByVotes')}</option>
              <option value="priorityScore">{tScores('sortByScore')}</option>
            </select>
          </div>

          {filteredFeatures.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <Layers className="h-12 w-12" />
              <p>{t('empty')}</p>
              <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
                {t('createFirst')}
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
                    <th className="px-3 py-2 font-medium">{tVotes('count')}</th>
                    <th className="px-3 py-2 font-medium">{tScores('score')}</th>
                    <th className="px-3 py-2 font-medium">{c('priority')}</th>
                    <th className="px-3 py-2 font-medium">{c('release')}</th>
                    <th className="px-3 py-2 font-medium">{c('owner')}</th>
                    <th className="px-3 py-2 font-medium">{c('creator')}</th>
                    <th className="px-3 py-2 font-medium">{c('createdAt')}</th>
                    <th className="px-3 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFeatures.map((feature) => (
                    <tr
                      key={feature.id}
                      className="group cursor-pointer border-b last:border-0 hover:bg-accent/40 transition-colors"
                      onClick={() => router.push(`/features/${feature.id}`)}
                    >
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer accent-primary"
                          checked={selectedIds.has(feature.id)}
                          onChange={() => toggleOne(feature.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{workspace?.name || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{feature.code || '—'}</td>
                      <td className="px-3 py-2 font-medium">{feature.title}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge variant="secondary" className={getStatusBadgeClasses('FEATURE', feature.status)}>
                          {tStatus(`FEATURE_${feature.status}`) || feature.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <VoteButton wsId={workspaceId!} entityType="FEATURE" entityId={feature.id} count={feature.voteCount ?? 0} invalidateKeys={['features', workspaceId]} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <ScoreEditor wsId={workspaceId!} entityType="FEATURE" entityId={feature.id} score={feature.score} invalidateKeys={['features', workspaceId]} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={cn('text-xs', ENTITY_PRIORITY_COLORS[feature.priority] || '')}
                          title={ENTITY_PRIORITY_LABELS[feature.priority] ?? feature.priority}
                        >
                          {feature.priority}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{releaseName(feature.releaseId)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{feature.assignee?.name || feature.assigneeName || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{feature.createdBy?.name || feature.createdBy?.email || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(feature.createdAt)}</td>
                      <td className="px-3 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(feature.id); }}
                        >
                          <Layers className="h-3.5 w-3.5 text-destructive" />
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
            {FEATURE_STATUS_COLUMN_IDS.map((id) => {
              const colors = STATUS_COLORS.FEATURE[id] ?? STATUS_COLORS.FEATURE.OPEN;
              return (
                <KanbanColumn
                  key={id}
                  id={id}
                  title={tStatus(`FEATURE_${id}`) || id}
                  className={`${colors.bg} ${colors.border}`}
                  count={getColumnFeaturesByStatus(id).length}
                >
                  <SortableContext
                    items={getColumnFeaturesByStatus(id).map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {getColumnFeaturesByStatus(id).map((feature) => (
                      <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay zIndex={40}>
            {activeFeature ? (
              <Card className={cn('w-72 rotate-3 shadow-lg opacity-90', getStatusClasses('FEATURE', activeFeature.status))}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {activeFeature.code && (
                      <span className="text-xs font-mono text-muted-foreground">{activeFeature.code}</span>
                    )}
                    <Badge variant="secondary" className="text-xs">{activeFeature.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium">{activeFeature.title}</p>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : viewMode === 'release' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {/* Unassigned column */}
            <KanbanColumn
              id={UNASSIGNED_COL}
              title={t('unassigned')}
              className="bg-gray-50/50 border-gray-200 min-w-[336px] w-[336px]"
              count={getColumnFeatures(null).length}
            >
              <SortableContext
                items={getColumnFeatures(null).map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {getColumnFeatures(null).map((feature) => (
                  <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </SortableContext>
            </KanbanColumn>

            {/* Release columns */}
            {columns.map((release) => {
              const releaseFeatures = getColumnFeatures(release.id);
              const totalPersonDays = releaseFeatures.reduce((s, f) => {
                const value = f.effortEstimate ?? 0;
                const unit = f.effortUnit || 'HOURS';
                return s + (unit === 'DAYS' ? value : value / 8);
              }, 0);
              const usedDays = Math.round(totalPersonDays * 10) / 10; // 1 decimal
              const capacity = release.totalCapacity != null
                ? { usedDays, totalDays: release.totalCapacity }
                : undefined;

              return (
              <KanbanColumn
                key={release.id}
                id={release.id}
                title={`${release.name}${release.version ? ` (${release.version})` : ''}`}
                className="bg-blue-50/50 border-blue-200 min-w-[336px] w-[336px]"
                count={releaseFeatures.length}
                capacity={capacity}
              >
                <SortableContext
                  items={getColumnFeatures(release.id).map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnFeatures(release.id).map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
                  ))}
                </SortableContext>
              </KanbanColumn>
            );
            })}
          </div>

          <DragOverlay zIndex={40}>
            {activeFeature ? (
              <Card className="w-72 rotate-3 shadow-lg opacity-90">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {activeFeature.code && (
                      <span className="text-xs font-mono text-muted-foreground">{activeFeature.code}</span>
                    )}
                    <Badge variant="secondary" className="text-xs">{activeFeature.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium">{activeFeature.title}</p>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : viewMode === 'epic' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4">
            {epicColumns.map((col) => {
              const colFeatures = getColumnFeaturesByEpic(col.parentId);
              const isEpic = col.parentId !== null;
              return (
                <KanbanColumn
                  key={col.id}
                  id={col.id}
                  title={col.title}
                  className={cn(
                    'min-w-[336px] w-[336px]',
                    isEpic ? 'bg-violet-50/50 border-violet-200' : 'bg-gray-50/50 border-gray-200',
                  )}
                  count={colFeatures.length}
                >
                  <SortableContext
                    items={colFeatures.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {colFeatures.map((feature) => (
                      <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
                    ))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay zIndex={40}>
            {activeFeature ? (
              <Card className="w-72 rotate-3 shadow-lg opacity-90">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {activeFeature.code && (
                      <span className="text-xs font-mono text-muted-foreground">{activeFeature.code}</span>
                    )}
                    <Badge variant="secondary" className="text-xs">{activeFeature.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium">{activeFeature.title}</p>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
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
              className="bg-gray-50/50 border-gray-200 min-w-[336px] w-[336px]"
              count={getColumnFeaturesByAssignee(null).length}
            >
              <SortableContext
                items={getColumnFeaturesByAssignee(null).map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {getColumnFeaturesByAssignee(null).map((feature) => (
                  <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </SortableContext>
            </KanbanColumn>

            {/* 当前登录用户 */}
            {assigneeColumns.mine && (
              <KanbanColumn
                id={assigneeColumns.mine.id}
                title={assigneeColumns.mine.name || assigneeColumns.mine.email}
                className="bg-blue-50/50 border-blue-200 min-w-[336px] w-[336px]"
                count={getColumnFeaturesByAssignee(assigneeColumns.mine.id).length}
              >
                <SortableContext
                  items={getColumnFeaturesByAssignee(assigneeColumns.mine.id).map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnFeaturesByAssignee(assigneeColumns.mine.id).map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
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
                className="bg-green-50/50 border-green-200 min-w-[336px] w-[336px]"
                count={getColumnFeaturesByAssignee(u.id).length}
              >
                <SortableContext
                  items={getColumnFeaturesByAssignee(u.id).map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnFeaturesByAssignee(u.id).map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} onDelete={(id) => deleteMutation.mutate(id)} />
                  ))}
                </SortableContext>
              </KanbanColumn>
            ))}
          </div>

          <DragOverlay zIndex={40}>
            {activeFeature ? (
              <Card className="w-72 rotate-3 shadow-lg opacity-90">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    {activeFeature.code && (
                      <span className="text-xs font-mono text-muted-foreground">{activeFeature.code}</span>
                    )}
                    <Badge variant="secondary" className="text-xs">{activeFeature.priority}</Badge>
                  </div>
                  <p className="text-sm font-medium">{activeFeature.title}</p>
                </CardContent>
              </Card>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
