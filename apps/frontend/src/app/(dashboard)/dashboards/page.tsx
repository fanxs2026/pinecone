'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportsApi, dashboardsApi, type DashboardCard, type Dashboard } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Plus, Save, X, GripVertical, Trash2 } from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { showToast } from '@/components/simple-toast';

// G1-P1-③ 自定义仪表盘（2026-08-16）：4 种轻量报表卡，拖拽排序，DB 工作区级共享
// 卡片数据复用报表端点（velocity/time/discovery/quality）

const CARD_TYPES = ['VELOCITY', 'TIME', 'DISCOVERY', 'QUALITY'] as const;
type CardType = (typeof CARD_TYPES)[number];

const uid = () => Math.random().toString(36).slice(2, 10);

function SortableCard({
  card,
  onRemove,
  children,
}: {
  card: DashboardCard;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-white p-4 ${isDragging ? 'opacity-50 shadow-lg' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground/60">
            <GripVertical className="h-4 w-4" />
          </span>
          {card.title}
        </span>
        <button
          onClick={onRemove}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-black/5 hover:text-red-500 group-hover:opacity-100"
          title="移除卡片"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

export default function DashboardsPage() {
  const { workspaceId } = useWorkspace();
  const t = useTranslations('dashboard');
  const c = useTranslations('common');
  const qc = useQueryClient();
  const [cards, setCards] = useState<DashboardCard[]>([]);
  const [addType, setAddType] = useState<CardType>('VELOCITY');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // P1 多仪表盘：盘列表 + 当前盘
  const [dashList, setDashList] = useState<Dashboard[]>([]);
  const [activeDashId, setActiveDashId] = useState<string | null>(null);
  const { refetch: refetchDashList } = useQuery({
    queryKey: ['dashboards-list', workspaceId],
    queryFn: async () => {
      const list = await dashboardsApi.list(workspaceId!).then((r) => r.data);
      setDashList(list);
      if (list.length > 0) {
        setActiveDashId((prev) => prev && list.some((d) => d.id === prev) ? prev : list[0].id);
      } else {
        setActiveDashId(null);
      }
      return list;
    },
    enabled: !!workspaceId,
  });

  // 当前盘切换 → 加载其卡片（空盘给默认 4 卡）
  useEffect(() => {
    const dash = dashList.find((d) => d.id === activeDashId);
    if (dash) {
      if (dash.config?.cards?.length) setCards(dash.config.cards);
      else setCards(CARD_TYPES.map((type) => ({ id: uid(), type, title: t(`card.${type}`) })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashId, dashList]);

  const { isLoading: dashLoading } = useQuery({
    queryKey: ['dashboard', workspaceId, activeDashId],
    queryFn: async () => {
      const d = await dashboardsApi.get(workspaceId!).then((r) => r.data);
      if (d?.config?.cards?.length && !activeDashId) {
        setCards(d.config.cards);
      }
      return d;
    },
    enabled: !!workspaceId && dashList.length === 0,
  });

  // 卡片数据（4 种报表端点）
  const { data: velocity } = useQuery({
    queryKey: ['reports-velocity', workspaceId],
    queryFn: () => reportsApi.velocity(workspaceId!, 3).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const { data: timeReport } = useQuery({
    queryKey: ['reports-time', workspaceId, 'person'],
    queryFn: () => reportsApi.time(workspaceId!, 'person').then((r) => r.data),
    enabled: !!workspaceId,
  });
  const { data: discovery } = useQuery({
    queryKey: ['reports-discovery', workspaceId],
    queryFn: () => reportsApi.discovery(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const { data: quality } = useQuery({
    queryKey: ['reports-quality', workspaceId, ''],
    queryFn: () => reportsApi.quality(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      activeDashId
        ? dashboardsApi.update(workspaceId!, activeDashId, { config: { cards } }).then((r) => r.data)
        : dashboardsApi.save(workspaceId!, { config: { cards } }).then((r) => r.data),
    onSuccess: () => {
      showToast(t('saved'));
      qc.invalidateQueries({ queryKey: ['dashboards-list', workspaceId] });
      qc.invalidateQueries({ queryKey: ['dashboard', workspaceId] });
    },
  });

  // P1 多仪表盘：新建 / 删除
  const createDashMutation = useMutation({
    mutationFn: (name: string) => dashboardsApi.create(workspaceId!, { name }).then((r) => r.data),
    onSuccess: (d) => {
      setActiveDashId(d.id);
      refetchDashList();
      showToast(t('saved'));
    },
  });
  const deleteDashMutation = useMutation({
    mutationFn: () => dashboardsApi.remove(workspaceId!, activeDashId!).then(() => refetchDashList()),
    onSuccess: () => {
      setActiveDashId(null);
      showToast(t('saved'));
    },
  });
  const handleNewDash = () => {
    const name = window.prompt(t('hint')) || '';
    if (name.trim()) createDashMutation.mutate(name.trim());
  };
  const handleDeleteDash = () => {
    if (window.confirm(t('confirmDeleteDashboard'))) deleteDashMutation.mutate();
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setCards((prev) => {
      const from = prev.findIndex((c) => c.id === active.id);
      const to = prev.findIndex((c) => c.id === over.id);
      if (from < 0 || to < 0) return prev;
      return arrayMove(prev, from, to);
    });
  };

  const cardContent = (type: CardType) => {
    switch (type) {
      case 'VELOCITY':
        return (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-2xl font-semibold">{velocity?.totals.points ?? 0}</span> pts · {velocity?.totals.count ?? 0} {t('tasks')}
            </p>
            <p className="text-xs text-muted-foreground">{t('avgPerSprint')}: {velocity?.totals.avgPerSprint ?? 0} pts</p>
          </div>
        );
      case 'TIME':
        return (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-2xl font-semibold">{timeReport?.totals.estimatedHours ?? 0}</span> / {timeReport?.totals.actualHours ?? 0} h
            </p>
            <p className="text-xs text-muted-foreground">{t('estVsActual')}</p>
          </div>
        );
      case 'DISCOVERY':
        return (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-2xl font-semibold">{discovery?.topEntities.reduce((s, g) => s + g.items.length, 0) ?? 0}</span> {t('topItems')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('themes')} {discovery?.themes.length ?? 0} · {t('defectRate')} {discovery?.conversion.defectRate ?? 0}%
            </p>
          </div>
        );
      case 'QUALITY':
      default: {
        const q = quality?.selected ?? quality?.releases?.[0];
        return (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-2xl font-semibold">{q?.testStats.passRate ?? 0}%</span> {t('passRate')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('defects')} {q?.defects.total ?? 0} · {t('escapeRate')} {q?.defects.escapeRate ?? 0}%
            </p>
          </div>
        );
      }
    }
  };

  const addCard = () => {
    setCards((prev) => [...prev, { id: uid(), type: addType, title: t(`card.${addType}`) }]);
  };

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
        <p className="mb-6 text-muted-foreground">{c('createWsFirst')}</p>
        <Button onClick={() => (window.location.href = '/')}>{c('goCreateHome')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* 工具栏：盘选择 + 加卡 + 保存 */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="flex h-9 max-w-[200px] rounded-md border border-input bg-transparent px-3 text-sm"
          value={activeDashId ?? ''}
          onChange={(e) => setActiveDashId(e.target.value || null)}
        >
          {dashList.length === 0 && <option value="">{t('hint')}</option>}
          {dashList.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={handleNewDash} disabled={createDashMutation.isPending}>
          <Plus className="mr-1 h-4 w-4" /> {t('newDashboard')}
        </Button>
        {activeDashId && (
          <Button variant="ghost" size="sm" onClick={handleDeleteDash} disabled={deleteDashMutation.isPending} title={t('deleteDashboard')}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
        <select
          className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={addType}
          onChange={(e) => setAddType(e.target.value as CardType)}
        >
          {CARD_TYPES.map((type) => (
            <option key={type} value={type}>{t(`card.${type}`)}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={addCard}>
          <Plus className="mr-1 h-4 w-4" /> {t('addCard')}
        </Button>
        <div className="ml-auto">
          <Button size="sm" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save className="mr-1 h-4 w-4" /> {t('save')}
          </Button>
        </div>
      </div>

      {/* 卡片网格（拖拽排序） */}
      {dashLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="grid gap-4 md:grid-cols-2">
              {cards.map((card) => (
                <div key={card.id} className="group">
                  <SortableCard
                    card={card}
                    onRemove={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}
                  >
                    {cardContent(card.type)}
                  </SortableCard>
                </div>
              ))}
              {cards.length === 0 && (
                <p className="py-16 text-center text-sm text-muted-foreground">{t('empty')}</p>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">{t('hint')}</CardTitle>
          <CardDescription className="text-xs">{t('hintDesc')}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
