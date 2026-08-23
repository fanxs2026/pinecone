'use client';

import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspace } from '@/hooks/use-workspace';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { workspaceApi, dashboardApi, aiApi, DashboardStats } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Lightbulb, Package, Layers, Columns3, Clock, LifeBuoy, Building2, Sparkles, Loader2, Activity, FileText, ClipboardCheck, Target, Tags, LayoutGrid, BarChart3, BookOpen, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ReportsPanel } from '@/components/reports-panel';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const { workspace, workspaceId, isLoading: wsLoading } = useWorkspace();
  const setSelectedWorkspace = useWorkspaceStore((s) => s.setSelectedWorkspace);
  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');
  const [showCreateWs, setShowCreateWs] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [summarySource, setSummarySource] = useState<'llm' | 'template'>('template');
  const [summaryLoading, setSummaryLoading] = useState(false);
  // P1：AI 洞察 + 周报
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [insightsData, setInsightsData] = useState<{ source: string; insights: { kind: string; severity: string; title: string; detail: string; count: number }[]; summary: string | null } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyData, setWeeklyData] = useState<{ source: string; period: { from: string; to: string }; report: string } | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const t = useTranslations('dashboard');
  const c = useTranslations('common');
  const n = useTranslations('nav');

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', workspaceId],
    queryFn: () => dashboardApi.stats(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // Phase 3-②：打开弹窗时拉取 AI 摘要（BYO key 缺失走模板降级）
  const fetchSummary = useCallback(() => {
    if (!workspaceId || summaryLoading) return;
    setSummaryLoading(true);
    aiApi
      .summarize(workspaceId, 'WORKSPACE')
      .then((r) => { setSummary(r.data.summary); setSummarySource(r.data.source); })
      .catch(() => { setSummary(''); })
      .finally(() => setSummaryLoading(false));
  }, [workspaceId, summaryLoading]);

  // P1：AI 洞察
  const fetchInsights = useCallback(() => {
    if (!workspaceId || insightsLoading) return;
    setInsightsLoading(true);
    aiApi
      .insights(workspaceId)
      .then((r) => setInsightsData(r.data))
      .catch(() => setInsightsData(null))
      .finally(() => setInsightsLoading(false));
  }, [workspaceId, insightsLoading]);

  // P1：AI 周报
  const fetchWeekly = useCallback(() => {
    if (!workspaceId || weeklyLoading) return;
    setWeeklyLoading(true);
    aiApi
      .weeklyReport(workspaceId)
      .then((r) => setWeeklyData(r.data))
      .catch(() => setWeeklyData(null))
      .finally(() => setWeeklyLoading(false));
  }, [workspaceId, weeklyLoading]);

  const severityStyle: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-300',
  };

  const actionLabel = (action: string) => {
    const map: Record<string, string> = {
      CREATED: t('actionCreated'),
      UPDATED: t('actionUpdated'),
      DELETED: t('actionDeleted'),
      TIME_LOGGED: t('actionTimeLogged'),
      STATUS_CHANGED: t('actionStatusChanged'),
    };
    return map[action] || t('actionOther');
  };

  const stats = [
    {
      label: t('statSupports'),
      value: statsData ? `${statsData.entities.supports.open} / ${statsData.entities.supports.total}` : '—',
      sub: t('openLabel'),
      icon: LifeBuoy,
      color: 'text-teal-600',
      href: '/supports',
    },
    {
      label: t('statIdeas'),
      value: statsData ? `${statsData.entities.ideas.open} / ${statsData.entities.ideas.total}` : '—',
      sub: t('openLabel'),
      icon: Lightbulb,
      color: 'text-blue-600',
      href: '/ideas',
    },
    {
      label: t('statFeatures'),
      value: statsData ? `${statsData.entities.features.open} / ${statsData.entities.features.total}` : '—',
      sub: t('openLabel'),
      icon: Layers,
      color: 'text-purple-600',
      href: '/features',
    },
    {
      label: t('statStories'),
      value: statsData ? `${statsData.entities.stories.open} / ${statsData.entities.stories.total}` : '—',
      sub: t('openLabel'),
      icon: Columns3,
      color: 'text-orange-600',
      href: '/stories',
    },
    {
      label: t('statTime'),
      value: statsData ? `${statsData.thisMonth.hours}h` : '—',
      sub: t('monthHours'),
      icon: Clock,
      color: 'text-cyan-600',
      href: '/time-tracking',
    },
    {
      label: t('statReleases'),
      value: statsData ? `${statsData.entities.releases.open} / ${statsData.entities.releases.total}` : '—',
      sub: t('openLabel'),
      icon: Package,
      color: 'text-green-600',
      href: '/releases',
    },
  ];

  // 主统计卡：可拖拽排序（独立 localStorage key，与"更多模块"互不干扰）
  // hydration 安全：首帧默认顺序（与 SSR 一致），useEffect 挂载后再应用本地顺序
  const STATS_ORDER_KEY = 'pinecone-home-stats-order';
  const [statsOrder, setStatsOrder] = useState<string[]>([]);
  const [statsHydrated, setStatsHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STATS_ORDER_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) setStatsOrder(saved);
    } catch { /* ignore */ }
    setStatsHydrated(true);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(STATS_ORDER_KEY, JSON.stringify(statsOrder)); } catch { /* ignore */ }
  }, [statsOrder]);
  const sortedStats = statsHydrated && statsOrder.length === stats.length
    ? [...stats].sort((a, b) => statsOrder.indexOf(a.href) - statsOrder.indexOf(b.href))
    : stats;
  const handleStatsDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const from = String(active.id);
      const to = String(over.id);
      setStatsOrder((prev) => {
        const base = prev.length === stats.length ? prev : stats.map((s) => s.href);
        return arrayMove(base, base.indexOf(from), base.indexOf(to));
      });
    }
  };

  // 更多模块入口：可拖拽排序，顺序存 localStorage（用户本地偏好，零迁移）
  const MODULE_IDS = ['/test-plans', '/okr', '/themes', '/dashboards', '/reports', '/kb'] as const;
  const HOME_MODULES_ORDER_KEY = 'pinecone-home-modules-order';
  const MODULE_DEFS: Record<string, { href: string; label: string; desc: string; icon: typeof Package; color: string }> = {
    '/test-plans': { href: '/test-plans', label: t('moduleTestPlans'), desc: t('moduleTestPlansDesc'), icon: ClipboardCheck, color: 'text-emerald-600' },
    '/okr': { href: '/okr', label: t('moduleOkr'), desc: t('moduleOkrDesc'), icon: Target, color: 'text-rose-600' },
    '/themes': { href: '/themes', label: t('moduleThemes'), desc: t('moduleThemesDesc'), icon: Tags, color: 'text-fuchsia-600' },
    '/dashboards': { href: '/dashboards', label: t('moduleDashboards'), desc: t('moduleDashboardsDesc'), icon: LayoutGrid, color: 'text-sky-600' },
    '/reports': { href: '/reports', label: t('moduleReports'), desc: t('moduleReportsDesc'), icon: BarChart3, color: 'text-indigo-600' },
    '/kb': { href: '/kb', label: t('moduleKb'), desc: t('moduleKbDesc'), icon: BookOpen, color: 'text-amber-600' },
  };
  const [moduleOrder, setModuleOrder] = useState<string[]>([]);
  const [moduleHydrated, setModuleHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(HOME_MODULES_ORDER_KEY) || '[]');
      if (Array.isArray(saved) && saved.length > 0) {
        setModuleOrder([...saved.filter((id) => MODULE_IDS.includes(id)), ...MODULE_IDS.filter((id) => !saved.includes(id))]);
      }
    } catch { /* ignore */ }
    setModuleHydrated(true);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(HOME_MODULES_ORDER_KEY, JSON.stringify(moduleOrder)); } catch { /* ignore */ }
  }, [moduleOrder]);
  const moduleSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sortedModules = moduleHydrated
    ? [...MODULE_IDS].sort((a, b) => moduleOrder.indexOf(a) - moduleOrder.indexOf(b)).map((id) => MODULE_DEFS[id])
    : [...MODULE_IDS].map((id) => MODULE_DEFS[id]);
  const handleModuleDragEnd = (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const from = String(active.id);
      const to = String(over.id);
      setModuleOrder((prev) => arrayMove(prev, prev.indexOf(from), prev.indexOf(to)));
    }
  };

  // Auto-open create form when navigated from sidebar "创建工作区"
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('create-ws=1')) {
      setShowCreateWs(true);
    }
  }, []);

  const createWs = useMutation({
    mutationFn: () =>
      workspaceApi.create({ name: wsName, slug: wsSlug || wsName.toLowerCase().replace(/\s+/g, '-') }).then((r) => r.data),
    onSuccess: (newWs) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      // Switch to the newly created workspace
      if (newWs?.id) {
        setSelectedWorkspace(newWs.id);
      }
      setWsName('');
      setWsSlug('');
      setShowCreateWs(false);
    },
  });

  // No workspace — show onboarding
  if (!wsLoading && !workspaceId) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{n('createWorkspace')}</CardTitle>
            <CardDescription>
              {t('onboardingDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {createWs.isError && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {(createWs.error as any)?.response?.data?.message || t('createFailed')}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{c('workspace')}{c('name')}</label>
              <Input
                placeholder={t('wsNamePlaceholder')}
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('wsSlugLabel')}</label>
              <Input
                placeholder="my-project"
                value={wsSlug}
                onChange={(e) => setWsSlug(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t('wsSlugHint')}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => createWs.mutate()}
              disabled={!wsName || createWs.isPending}
            >
              {createWs.isPending ? c('creating') : n('createWorkspace')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('welcomeBack')}{user?.name ? `, ${user.name}` : ''}
            {statsData && statsData.thisWeek.created > 0 && (
              <span className="ml-3 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 align-middle text-xs font-medium text-primary">
                {t('weeklyNew', { count: statsData.thisWeek.created })}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground">
            {workspace ? `${c('workspace')}: ${workspace.name}` : t('workspaceOverview')}
          </p>
        </div>
        {/* Phase 3-② AI 摘要试点 + P1 AI 洞察/周报 */}
        {workspaceId && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setInsightsOpen(true); fetchInsights(); }}>
              <Activity className="mr-1 h-4 w-4" />{t('aiInsights')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setWeeklyOpen(true); fetchWeekly(); }}>
              <FileText className="mr-1 h-4 w-4" />{t('aiWeekly')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setSummaryOpen(true); fetchSummary(); }}>
              <Sparkles className="mr-1 h-4 w-4" />{t('aiSummary')}
            </Button>
          </div>
        )}
      </div>

      {/* AI 摘要弹窗 */}
      {summaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSummaryOpen(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-4 w-4" />{t('aiSummary')}</CardTitle>
              <CardDescription>{t('aiSummaryHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              {summaryLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />{t('aiSummaryLoading')}
                </div>
              ) : summary ? (
                <div className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{summarySource === 'llm' ? t('aiSourceLlm') : t('aiSourceTemplate')}</Badge>
                    {summarySource === 'template' && <span>{t('aiSourceHint')}</span>}
                  </div>
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">{t('aiSummaryError')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* P1：AI 洞察弹窗 */}
      {insightsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInsightsOpen(false)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-4 w-4" />{t('aiInsights')}</CardTitle>
              <CardDescription>{t('aiInsightsHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              {insightsLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />{t('aiSummaryLoading')}
                </div>
              ) : insightsData ? (
                <div className="space-y-2">
                  {insightsData.summary && (
                    <p className="rounded-md bg-violet-50 p-3 text-sm leading-relaxed text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">
                      {insightsData.summary}
                    </p>
                  )}
                  {insightsData.insights.map((ins) => (
                    <div key={ins.kind} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{ins.title}</span>
                        <Badge variant="secondary" className={cn('shrink-0 text-[10px]', severityStyle[ins.severity])}>
                          {ins.severity === 'high' ? t('sevHigh') : ins.severity === 'medium' ? t('sevMedium') : t('sevLow')}
                        </Badge>
                      </div>
                      {ins.detail && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ins.detail}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">{t('aiSummaryError')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* P1：AI 周报弹窗 */}
      {weeklyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setWeeklyOpen(false)}>
          <Card className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg"><FileText className="h-4 w-4" />{t('aiWeekly')}</CardTitle>
              {weeklyData && (
                <CardDescription>{t('aiWeeklyPeriod', { from: weeklyData.period.from, to: weeklyData.period.to })}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="max-h-[60vh] overflow-y-auto">
              {weeklyLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />{t('aiSummaryLoading')}
                </div>
              ) : weeklyData ? (
                <div className="space-y-3">
                  <div className="whitespace-pre-wrap rounded-md border p-4 text-sm leading-relaxed">{weeklyData.report}</div>
                  <Badge variant="outline" className="text-xs">{weeklyData.source === 'llm' ? t('aiSourceLlm') : t('aiSourceTemplate')}</Badge>
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">{t('aiSummaryError')}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <DndContext sensors={moduleSensors} collisionDetection={closestCenter} onDragEnd={handleStatsDragEnd}>
        <SortableContext items={sortedStats.map((s) => s.href)} strategy={rectSortingStrategy}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {sortedStats.map((stat) => (
              <SortableStatCard key={stat.href} stat={stat} loading={statsLoading} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* 更多模块入口（可拖拽排序，localStorage 持久化） */}
      {workspaceId && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">{t('moreModules')}</h2>
            <span className="text-xs text-muted-foreground">{t('moduleDragHint')}</span>
          </div>
          <DndContext sensors={moduleSensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
            <SortableContext items={sortedModules.map((m) => m.href)} strategy={rectSortingStrategy}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {sortedModules.map((m) => (
                  <SortableModuleCard key={m.href} def={m} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* P1-⑧ 仪表盘报表 */}
      {workspaceId && <ReportsPanel workspaceId={workspaceId} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('recentActivity')}</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : statsData && statsData.recentActivities.length > 0 ? (
              <div className="space-y-2.5">
                {statsData.recentActivities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(a.createdAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-muted-foreground">{actionLabel(a.action)}</span>{' '}
                      {a.entityCode && (
                        <span className="font-mono text-xs font-medium">{a.entityCode}</span>
                      )}
                      {a.entityTitle && <span className="text-muted-foreground"> · {a.entityTitle}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {a.user?.name || a.user?.email}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noActivity')}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t('workspaceManage')}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowCreateWs(!showCreateWs)}>
                {t('createNewWorkspace')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showCreateWs && (
              <div className="space-y-3">
                {createWs.isError && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {(createWs.error as any)?.response?.data?.message || t('createFailed')}
                  </div>
                )}
                {createWs.isSuccess && (
                  <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                    {t('workspaceCreated')}
                  </div>
                )}
                <Input
                  placeholder={`${c('workspace')}${c('name')}`}
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                />
                <Input
                  placeholder={t('wsSlugOptional')}
                  value={wsSlug}
                  onChange={(e) => setWsSlug(e.target.value)}
                />
                <Button
                  onClick={() => createWs.mutate()}
                  disabled={!wsName || createWs.isPending}
                >
                  {createWs.isPending ? c('creating') : t('confirmCreate')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('afterCreateHint')}
                </p>
              </div>
            )}
            {!showCreateWs && (
              <p className="text-sm text-muted-foreground">
                {t('currentWorkspace', { name: workspace?.name ?? '—' })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 首页模块入口卡：拖拽手柄排序（点击卡片跳转不受影响） */
function SortableModuleCard({ def }: { def: { href: string; label: string; desc: string; icon: typeof Package; color: string } }) {
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: def.href });
  // dnd-kit 的 aria-describedby（DndDescribedBy-N）来自全局计数器，SSR/客户端计数不一致 → 剥离避免 hydration 报错
  const { 'aria-describedby': _adb, ...attributes } = dndAttrs;
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = def.icon;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-70' : ''}>
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <a href={def.href} className="flex min-w-0 flex-1 items-center gap-2">
            <CardTitle className="truncate text-sm font-medium">{def.label}</CardTitle>
            <Icon className={`h-4 w-4 shrink-0 ${def.color}`} />
          </a>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
            title="拖拽排序"
            aria-label="drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>
          <a href={def.href} className="block">
            <p className="text-xs text-muted-foreground">{def.desc}</p>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

/** 首页主统计卡：拖拽手柄排序（点击卡片跳转不受影响） */
function SortableStatCard({ stat, loading }: { stat: { href: string; label: string; value: string; sub: string; icon: typeof Package; color: string }; loading: boolean }) {
  const { attributes: dndAttrs, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stat.href });
  // 同上：剥离不稳定的 aria-describedby（DndDescribedBy-N），避免 SSR/客户端 hydration 不匹配
  const { 'aria-describedby': _adb, ...attributes } = dndAttrs;
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = stat.icon;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'opacity-70' : ''}>
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <a href={stat.href} className="flex min-w-0 flex-1 items-center gap-2">
            <CardTitle className="truncate text-sm font-medium">{stat.label}</CardTitle>
            <Icon className={`h-4 w-4 shrink-0 ${stat.color}`} />
          </a>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
            title="拖拽排序"
            aria-label="drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent>
          <a href={stat.href} className="block">
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.sub}</p>
              </>
            )}
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
