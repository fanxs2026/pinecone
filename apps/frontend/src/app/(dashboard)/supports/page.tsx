'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { supportApi, themesApi } from '@/lib/api-client';
import { resolveAssigneeAction } from '@/lib/assignee-utils';
import { showToast } from '@/components/simple-toast';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';
import { formatDate } from '@/lib/date-utils';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import BrowseModeSwitcher from '@/components/browse-mode-switcher';
import ExportButton from '@/components/export-button';
import KanbanColumn from '@/app/(dashboard)/stories/kanban-column';
import {LifeBuoy, Plus, Search, Trash2, List, LayoutGrid, User, Loader2 } from 'lucide-react';
import { STATUS_COLORS, getStatusClasses, getStatusBadgeClasses } from '@/lib/status-colors';
import { SUPPORT_STATUSES } from '@/lib/entity-statuses';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';

const SUPPORT_TYPES = ['SUPPORT_REQUEST', 'DEFECT'] as const;

const typeStyleMap: Record<string, string> = {
  SUPPORT_REQUEST: 'bg-purple-100 text-purple-700',
  DEFECT: 'bg-red-100 text-red-700',
};

const SUPPORT_STATUS_COLUMN_IDS = SUPPORT_STATUSES;

const UNASSIGNED_COL = '__unassigned__';

type ViewMode = 'list' | 'status' | 'assignee';

export default function SupportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState<string>('SUPPORT_REQUEST');
  const [viewMode, setViewMode] = useState<ViewMode>('assignee');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [themeFilter, setThemeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const t = useTranslations('support');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const tVotes = useTranslations('votes');
  const tScores = useTranslations('scores');
  const tThemes = useTranslations('themes');
  const currentUser = useAuthStore((s) => s.user);

  const statusLabelMap: Record<string, string> = {
    OPEN: t('open'),
    IN_REVIEW: t('inReview'),
    CLOSED: t('closed'),
  };

  const { data: supportsData, isLoading } = useQuery({
    queryKey: ['supports', workspaceId, search, sortBy, themeFilter],
    queryFn: () => supportApi.list(workspaceId!, { search: search || undefined, sortBy: sortBy || undefined, themeId: themeFilter || undefined }).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const supports = supportsData?.items ?? [];

  const { data: themesData } = useQuery({
    queryKey: ['themes', workspaceId],
    queryFn: () => themesApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const themes = themesData ?? [];

  // 筛选后的数据（状态 + 类型，清单模式使用）
  const filteredSupports = useMemo(() => {
    return supports.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (typeFilter && s.type !== typeFilter) return false;
      return true;
    });
  }, [supports, statusFilter, typeFilter]);

  // 勾选/全选逻辑
  const allChecked = filteredSupports.length > 0 && filteredSupports.every((s) => selectedIds.has(s.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filteredSupports.forEach((s) => next.delete(s.id));
      } else {
        filteredSupports.forEach((s) => next.add(s.id));
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

  const exportHeaders = [c('workspace'), c('code'), c('title'), t('type'), c('status'), c('owner'), c('creator'), c('createdAt')];
  const exportRows = () =>
    filteredSupports.map((s) => [
      workspace?.name || '',
      s.code || '',
      s.title,
      t(s.type),
      statusLabelMap[s.status] || s.status,
      s.assignee?.name || s.assigneeName || '',
      s.createdBy?.name || s.createdBy?.email || '',
      formatDate(s.createdAt),
    ]);

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description?: string; type?: string }) =>
      supportApi.create(workspaceId!, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supports', workspaceId] });
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      setNewType('SUPPORT_REQUEST');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => supportApi.remove(workspaceId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supports', workspaceId] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      supportApi.update(workspaceId!, id, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supports', workspaceId] }),
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      supportApi.update(workspaceId!, id, { assigneeId }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supports', workspaceId] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const getColumnSupports = (status: string) => supports.filter((s) => s.status === status);

  // 按负责人分组列：未分配 → 当前登录用户 → 其他按名字母排序
  const assigneeColumns = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    supports.forEach((s) => {
      const a = s.assignee;
      if (a && a.id) map.set(a.id, { id: a.id, name: a.name || '', email: a.email });
    });
    const me = currentUser?.id;
    const mine = me && map.has(me) ? map.get(me)! : null;
    const others = Array.from(map.values())
      .filter((u) => u.id !== me)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return { mine, others };
  }, [supports, currentUser]);

  const getColumnSupportsByAssignee = (userId: string | null) =>
    supports.filter((s) => (s.assignee?.id ?? null) === userId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const supportId = active.id as string;
    const targetColumnId = over.id as string;
    const support = supports.find((s) => s.id === supportId);
    if (!support) return;

    // 按负责人视图：拖到某用户列 = 改负责人；拖到未分配列 = 清空负责人
    if (viewMode === 'assignee') {
      const isUnassignedCol = targetColumnId === UNASSIGNED_COL;
      const isUserCol = assigneeColumns.mine?.id === targetColumnId || assigneeColumns.others.some((u) => u.id === targetColumnId);
      if (!isUnassignedCol && !isUserCol) {
        showToast(c('invalidDrop'));
        return;
      }
      const nextAssigneeId = resolveAssigneeAction(support.assignee?.id, isUnassignedCol ? null : targetColumnId);
      if (nextAssigneeId !== undefined) updateAssigneeMutation.mutate({ id: supportId, assigneeId: nextAssigneeId });
      return;
    }

    if (viewMode !== 'status') return;
    if (!SUPPORT_STATUS_COLUMN_IDS.some((s) => s === targetColumnId)) {
      showToast(c('invalidDrop'));
      return;
    }
    if (support.status !== targetColumnId) {
      updateStatusMutation.mutate({ id: supportId, status: targetColumnId });
    }
  };

  const activeSupport = activeId ? supports.find((s) => s.id === activeId) : null;

  const renderSupportCard = (support: (typeof supports)[number]) => (
    <Card
      key={support.id}
      className="group cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => window.open(`/supports/${support.id}`, '_blank', 'noopener')}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {support.code && (
              <span className="text-xs font-mono tracking-wider text-muted-foreground">{support.code}</span>
            )}
            <Badge variant="secondary" className={typeStyleMap[support.type] || 'bg-gray-100'}>
              {t(support.type)}
            </Badge>
            <Badge variant="secondary" className={getStatusBadgeClasses('SUPPORT', support.status)}>
              {statusLabelMap[support.status]}
            </Badge>
            <VoteButton wsId={workspaceId!} entityType="SUPPORT" entityId={support.id} count={support.voteCount ?? 0} invalidateKeys={['supports', workspaceId]} />
            <ScoreEditor wsId={workspaceId!} entityType="SUPPORT" entityId={support.id} score={support.score} invalidateKeys={['supports', workspaceId]} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(support.id); }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        <p className="mt-1.5 text-sm font-medium break-words">{support.title}</p>
        {support.tags && support.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {support.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary border border-primary/20 text-xs">{tag}</Badge>
            ))}
          </div>
        )}
        {support.assignee && (
          <p className="mt-1 text-xs text-muted-foreground">{support.assignee.name}</p>
        )}
      </CardContent>
    </Card>
  );

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
        <LifeBuoy className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
        <p className="mb-6 text-muted-foreground">{t('noWorkspaceHint')}</p>
        <Button onClick={() => window.location.href = '/'}>{c('goCreateHome')}</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <BrowseModeSwitcher
            value={viewMode}
            onChange={(m) => setViewMode(m as ViewMode)}
            options={[
              { id: 'list', label: c('list'), icon: <List className="h-3.5 w-3.5" /> },
              { id: 'status', label: c('byStatus'), icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              { id: 'assignee', label: c('byAssignee'), icon: <User className="h-3.5 w-3.5" /> },
            ]}
          />
          {viewMode === 'list' && (
            <ExportButton
              filename="supports"
              headers={exportHeaders}
              rows={exportRows()}
              selectedIds={selectedIds}
              rowIds={filteredSupports.map((s) => s.id)}
              disabled={filteredSupports.length === 0}
              pdfTitle={t('title')}
            />
          )}
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1 h-4 w-4" /> {t('newRequest')}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="space-y-3 pt-6">
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('type')}:</span>
              <select
                className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
              >
                {SUPPORT_TYPES.map((type) => (
                  <option key={type} value={type}>{t(type)}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => createMutation.mutate({ title: newTitle, description: newDescription || undefined, type: newType })}
                disabled={!newTitle || createMutation.isPending}
              >
                {createMutation.isPending ? c('creating') : c('create')}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{c('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {viewMode === 'list' && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">{c('status')}: {c('all')}</option>
            {SUPPORT_STATUS_COLUMN_IDS.map((s) => (
              <option key={s} value={s}>{statusLabelMap[s] || s}</option>
            ))}
          </select>
          <select
            className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">{t('type')}: {c('all')}</option>
            {SUPPORT_TYPES.map((tp) => (
              <option key={tp} value={tp}>{t(tp)}</option>
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
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : viewMode === 'list' ? (
        filteredSupports.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <LifeBuoy className="h-12 w-12" />
            <p>{t('noSupport')}</p>
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
                  <th className="px-3 py-2 font-medium">{t('type')}</th>
                  <th className="px-3 py-2 font-medium">{c('status')}</th>
                  <th className="px-3 py-2 font-medium">{tVotes('count')}</th>
                  <th className="px-3 py-2 font-medium">{tScores('score')}</th>
                  <th className="px-3 py-2 font-medium">{c('owner')}</th>
                  <th className="px-3 py-2 font-medium">{c('creator')}</th>
                  <th className="px-3 py-2 font-medium">{c('createdAt')}</th>
                  <th className="px-3 py-2 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSupports.map((support) => (
                  <tr
                    key={support.id}
                    className="group cursor-pointer border-b last:border-0 hover:bg-accent/40 transition-colors"
                    onClick={() => router.push(`/supports/${support.id}`)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer accent-primary"
                        checked={selectedIds.has(support.id)}
                        onChange={() => toggleOne(support.id)}
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{workspace?.name || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{support.code || '—'}</td>
                    <td className="px-3 py-2 font-medium">{support.title}</td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary" className={typeStyleMap[support.type] || 'bg-gray-100'}>
                        {t(support.type)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant="secondary" className={getStatusBadgeClasses('SUPPORT', support.status)}>
                        {statusLabelMap[support.status]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <VoteButton wsId={workspaceId!} entityType="SUPPORT" entityId={support.id} count={support.voteCount ?? 0} invalidateKeys={['supports', workspaceId]} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <ScoreEditor wsId={workspaceId!} entityType="SUPPORT" entityId={support.id} score={support.score} invalidateKeys={['supports', workspaceId]} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{support.assignee?.name || support.assigneeName || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{support.createdBy?.name || support.createdBy?.email || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(support.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(support.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : viewMode === 'status' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-4">
            {SUPPORT_STATUS_COLUMN_IDS.map((id) => {
              const colors = STATUS_COLORS.SUPPORT[id] ?? STATUS_COLORS.SUPPORT.OPEN;
              return (
                <KanbanColumn
                  key={id}
                  id={id}
                  title={tStatus(`SUPPORT_${id}`) || id}
                  className={`${colors.bg} ${colors.border}`}
                  count={getColumnSupports(id).length}
                >
                  <SortableContext
                    items={getColumnSupports(id).map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {getColumnSupports(id).map((support) => renderSupportCard(support))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay zIndex={40}>
            {activeSupport ? (
              <Card className={cn('w-72 rotate-3 shadow-lg opacity-90', getStatusClasses('SUPPORT', activeSupport.status))}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{activeSupport.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{t(activeSupport.type)}</Badge>
                  </div>
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
              className="bg-gray-50/50 border-gray-200"
              count={getColumnSupportsByAssignee(null).length}
            >
              <SortableContext
                items={getColumnSupportsByAssignee(null).map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {getColumnSupportsByAssignee(null).map((support) => renderSupportCard(support))}
              </SortableContext>
            </KanbanColumn>

            {/* 当前登录用户 */}
            {assigneeColumns.mine && (
              <KanbanColumn
                id={assigneeColumns.mine.id}
                title={assigneeColumns.mine.name || assigneeColumns.mine.email}
                className="bg-blue-50/50 border-blue-200"
                count={getColumnSupportsByAssignee(assigneeColumns.mine.id).length}
              >
                <SortableContext
                  items={getColumnSupportsByAssignee(assigneeColumns.mine.id).map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnSupportsByAssignee(assigneeColumns.mine.id).map((support) => renderSupportCard(support))}
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
                count={getColumnSupportsByAssignee(u.id).length}
              >
                <SortableContext
                  items={getColumnSupportsByAssignee(u.id).map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnSupportsByAssignee(u.id).map((support) => renderSupportCard(support))}
                </SortableContext>
              </KanbanColumn>
            ))}
          </div>

          <DragOverlay zIndex={40}>
            {activeSupport ? (
              <Card className={cn('w-72 rotate-3 shadow-lg opacity-90', getStatusClasses('SUPPORT', activeSupport.status))}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{activeSupport.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{t(activeSupport.type)}</Badge>
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
