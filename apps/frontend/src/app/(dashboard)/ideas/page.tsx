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
import { ideaApi, themesApi } from '@/lib/api-client';
import { resolveAssigneeAction } from '@/lib/assignee-utils';
import { showToast } from '@/components/simple-toast';
import VoteButton from '@/components/vote-button';
import ScoreEditor from '@/components/score-editor';
import { useWorkspace } from '@/hooks/use-workspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import BrowseModeSwitcher from '@/components/browse-mode-switcher';
import ExportButton from '@/components/export-button';
import KanbanColumn from '@/app/(dashboard)/stories/kanban-column';
import {Lightbulb, Plus, Search, Trash2, List, LayoutGrid, User, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/date-utils';
import { getStatusBadgeClasses, STATUS_COLORS, getStatusClasses } from '@/lib/status-colors';
import { IDEA_STATUSES } from '@/lib/entity-statuses';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';

type ViewMode = 'list' | 'status' | 'assignee';

const IDEA_STATUS_COLUMN_IDS = IDEA_STATUSES;

const UNASSIGNED_COL = '__unassigned__';

export default function IdeasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('assignee');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const t = useTranslations('ideas');
  const tStatus = useTranslations('status');
  const c = useTranslations('common');
  const tVotes = useTranslations('votes');
  const tScores = useTranslations('scores');
  const tThemes = useTranslations('themes');
  const currentUser = useAuthStore((s) => s.user);
  const [sortBy, setSortBy] = useState('');
  const [themeFilter, setThemeFilter] = useState('');

  const { data: ideasData, isLoading } = useQuery({
    queryKey: ['ideas', workspaceId, search, sortBy, themeFilter],
    queryFn: () => ideaApi.list(workspaceId!, { search: search || undefined, sortBy: sortBy || undefined, themeId: themeFilter || undefined }).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const ideas = ideasData?.items ?? [];

  const { data: themesData } = useQuery({
    queryKey: ['themes', workspaceId],
    queryFn: () => themesApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const themes = themesData ?? [];

  // 筛选后的数据（状态 + 分类，清单模式使用）
  const filteredIdeas = useMemo(() => {
    return ideas.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (categoryFilter && (i.category || '') !== categoryFilter) return false;
      return true;
    });
  }, [ideas, statusFilter, categoryFilter]);

  const categories = useMemo(
    () => Array.from(new Set(ideas.map((i) => i.category).filter(Boolean))).sort() as string[],
    [ideas]
  );

  // 勾选/全选逻辑
  const allChecked = filteredIdeas.length > 0 && filteredIdeas.every((i) => selectedIds.has(i.id));
  const toggleAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        filteredIdeas.forEach((i) => next.delete(i.id));
      } else {
        filteredIdeas.forEach((i) => next.add(i.id));
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

  const exportHeaders = [c('workspace'), c('code'), c('title'), c('status'), c('category'), c('owner'), c('creator'), c('createdAt')];
  const exportRows = () =>
    filteredIdeas.map((i) => [
      workspace?.name || '',
      i.code || '',
      i.title,
      tStatus(`IDEA_${i.status}`) || i.status,
      i.category || '',
      i.assignee?.name || i.assigneeName || '',
      i.createdBy?.name || i.createdBy?.email || '',
      formatDate(i.createdAt),
    ]);

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description?: string; category?: string }) =>
      ideaApi.create(workspaceId!, data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas', workspaceId] });
      setShowCreate(false);
      setNewTitle('');
      setNewDescription('');
      setNewCategory('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => ideaApi.remove(workspaceId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ideas', workspaceId] }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      ideaApi.update(workspaceId!, id, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ideas', workspaceId] }),
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      ideaApi.update(workspaceId!, id, { assigneeId }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ideas', workspaceId] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const getColumnIdeas = (status: string) => ideas.filter((i) => i.status === status);

  // 按负责人分组列：未分配 → 当前登录用户 → 其他按名字母排序
  const assigneeColumns = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email: string }>();
    ideas.forEach((i) => {
      const a = i.assignee;
      if (a && a.id) map.set(a.id, { id: a.id, name: a.name || '', email: a.email });
    });
    const me = currentUser?.id;
    const mine = me && map.has(me) ? map.get(me)! : null;
    const others = Array.from(map.values())
      .filter((u) => u.id !== me)
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    return { mine, others };
  }, [ideas, currentUser]);

  const getColumnIdeasByAssignee = (userId: string | null) =>
    ideas.filter((i) => (i.assignee?.id ?? null) === userId);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const ideaId = active.id as string;
    const targetColumnId = over.id as string;
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;

    // 按负责人视图：拖到某用户列 = 改负责人；拖到未分配列 = 清空负责人
    if (viewMode === 'assignee') {
      const isUnassignedCol = targetColumnId === UNASSIGNED_COL;
      const isUserCol = assigneeColumns.mine?.id === targetColumnId || assigneeColumns.others.some((u) => u.id === targetColumnId);
      if (!isUnassignedCol && !isUserCol) {
        showToast(c('invalidDrop'));
        return;
      }
      const nextAssigneeId = resolveAssigneeAction(idea.assignee?.id, isUnassignedCol ? null : targetColumnId);
      if (nextAssigneeId !== undefined) updateAssigneeMutation.mutate({ id: ideaId, assigneeId: nextAssigneeId });
      return;
    }

    if (viewMode !== 'status') return;
    if (!IDEA_STATUS_COLUMN_IDS.some((s) => s === targetColumnId)) {
      showToast(c('invalidDrop'));
      return;
    }
    if (idea.status !== targetColumnId) {
      updateStatusMutation.mutate({ id: ideaId, status: targetColumnId });
    }
  };

  const activeIdea = activeId ? ideas.find((i) => i.id === activeId) : null;

  const renderIdeaCard = (idea: (typeof ideas)[number]) => (
    <Card
      key={idea.id}
      className="group cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => window.open(`/ideas/${idea.id}`, '_blank', 'noopener')}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {idea.code && (
              <span className="text-xs font-mono tracking-wider text-muted-foreground">{idea.code}</span>
            )}
            {idea.category && (
              <span className="text-xs text-muted-foreground">{idea.category}</span>
            )}
            <Badge
              variant="secondary"
              className={getStatusBadgeClasses('IDEA', idea.status)}
            >
              {tStatus(`IDEA_${idea.status}`) || idea.status}
            </Badge>
            <VoteButton wsId={workspaceId!} entityType="IDEA" entityId={idea.id} count={idea.voteCount ?? 0} invalidateKeys={['ideas', workspaceId]} />
            <ScoreEditor wsId={workspaceId!} entityType="IDEA" entityId={idea.id} score={idea.score} invalidateKeys={['ideas', workspaceId]} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(idea.id); }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
        <p className="mt-1.5 text-sm font-medium break-words">{idea.title}</p>
        {idea.tags && idea.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {idea.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="bg-primary/10 text-primary border border-primary/20 text-xs">{tag}</Badge>
            ))}
          </div>
        )}
        {idea.assignee && (
          <p className="mt-1 text-xs text-muted-foreground">{idea.assignee.name}</p>
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
        <Lightbulb className="mb-4 h-12 w-12 text-muted-foreground" />
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
              filename="ideas"
              headers={exportHeaders}
              rows={exportRows()}
              selectedIds={selectedIds}
              rowIds={filteredIdeas.map((i) => i.id)}
              disabled={filteredIdeas.length === 0}
              pdfTitle={t('title')}
            />
          )}
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-1 h-4 w-4" /> {t('newIdea')}
          </Button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('newIdea')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <Input
              placeholder={t('categoryPlaceholder')}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                onClick={() => createMutation.mutate({ title: newTitle, description: newDescription, category: newCategory })}
                disabled={!newTitle || createMutation.isPending}
              >
                {createMutation.isPending ? t('creating') : t('create')}
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
            {IDEA_STATUS_COLUMN_IDS.map((s) => (
              <option key={s} value={s}>{tStatus(`IDEA_${s}`) || s}</option>
            ))}
          </select>
          {categories.length > 0 && (
            <select
              className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">{c('category')}: {c('all')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
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
        filteredIdeas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Lightbulb className="h-12 w-12" />
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
                  <th className="px-3 py-2 font-medium">{c('category')}</th>
                  <th className="px-3 py-2 font-medium">{c('owner')}</th>
                  <th className="px-3 py-2 font-medium">{c('creator')}</th>
                  <th className="px-3 py-2 font-medium">{c('createdAt')}</th>
                  <th className="px-3 py-2 font-medium w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredIdeas.map((idea) => (
                  <tr
                    key={idea.id}
                    className="group cursor-pointer border-b last:border-0 hover:bg-accent/40 transition-colors"
                    onClick={() => router.push(`/ideas/${idea.id}`)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer accent-primary"
                        checked={selectedIds.has(idea.id)}
                        onChange={() => toggleOne(idea.id)}
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{workspace?.name || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{idea.code || '—'}</td>
                    <td className="px-3 py-2 font-medium">{idea.title}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Badge variant="secondary" className={getStatusBadgeClasses('IDEA', idea.status)}>
                        {tStatus(`IDEA_${idea.status}`) || idea.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <VoteButton wsId={workspaceId!} entityType="IDEA" entityId={idea.id} count={idea.voteCount ?? 0} invalidateKeys={['ideas', workspaceId]} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <ScoreEditor wsId={workspaceId!} entityType="IDEA" entityId={idea.id} score={idea.score} invalidateKeys={['ideas', workspaceId]} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{idea.category || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{idea.assignee?.name || idea.assigneeName || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{idea.createdBy?.name || idea.createdBy?.email || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(idea.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(idea.id); }}
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
            {IDEA_STATUS_COLUMN_IDS.map((id) => {
              const colors = STATUS_COLORS.IDEA[id] ?? STATUS_COLORS.IDEA.OPEN;
              return (
                <KanbanColumn
                  key={id}
                  id={id}
                  title={tStatus(`IDEA_${id}`) || id}
                  className={`${colors.bg} ${colors.border}`}
                  count={getColumnIdeas(id).length}
                >
                  <SortableContext
                    items={getColumnIdeas(id).map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {getColumnIdeas(id).map((idea) => renderIdeaCard(idea))}
                  </SortableContext>
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay zIndex={40}>
            {activeIdea ? (
              <Card className={cn('w-72 rotate-3 shadow-lg opacity-90', getStatusClasses('IDEA', activeIdea.status))}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{activeIdea.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{activeIdea.category || '—'}</Badge>
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
              count={getColumnIdeasByAssignee(null).length}
            >
              <SortableContext
                items={getColumnIdeasByAssignee(null).map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {getColumnIdeasByAssignee(null).map((idea) => renderIdeaCard(idea))}
              </SortableContext>
            </KanbanColumn>

            {/* 当前登录用户 */}
            {assigneeColumns.mine && (
              <KanbanColumn
                id={assigneeColumns.mine.id}
                title={assigneeColumns.mine.name || assigneeColumns.mine.email}
                className="bg-blue-50/50 border-blue-200"
                count={getColumnIdeasByAssignee(assigneeColumns.mine.id).length}
              >
                <SortableContext
                  items={getColumnIdeasByAssignee(assigneeColumns.mine.id).map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnIdeasByAssignee(assigneeColumns.mine.id).map((idea) => renderIdeaCard(idea))}
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
                count={getColumnIdeasByAssignee(u.id).length}
              >
                <SortableContext
                  items={getColumnIdeasByAssignee(u.id).map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {getColumnIdeasByAssignee(u.id).map((idea) => renderIdeaCard(idea))}
                </SortableContext>
              </KanbanColumn>
            ))}
          </div>

          <DragOverlay zIndex={40}>
            {activeIdea ? (
              <Card className={cn('w-72 rotate-3 shadow-lg opacity-90', getStatusClasses('IDEA', activeIdea.status))}>
                <CardContent className="p-3">
                  <p className="text-sm font-medium">{activeIdea.title}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{activeIdea.category || '—'}</Badge>
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
