'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, sprintsApi, type DiscoveryReport, type QualityReport, type CoverageReport, type PivotMatrix } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTranslations } from 'next-intl';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadExcel } from '@/lib/export-excel';
import { downloadPdf } from '@/lib/export-pdf';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

const CHART_HEIGHT = 280;

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  padding: '8px 12px',
};

/** 图表空态/加载/错误占位（P0-P2-5：isError 不再静默显示 "—"） */
function ChartState({
  loading,
  empty,
  error,
  errorText,
  children,
}: {
  loading: boolean;
  empty: boolean;
  error?: boolean;
  errorText?: string;
  children: ReactNode;
}) {
  if (loading) return <Skeleton style={{ height: CHART_HEIGHT }} className="w-full rounded-lg" />;
  if (error) return <p className="py-16 text-center text-sm text-red-500">{errorText ?? 'Failed to load'}</p>;
  if (empty) return <p className="py-16 text-center text-sm text-muted-foreground">—</p>;
  return <>{children}</>;
}

export default function ReportsPage() {
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const t = useTranslations('reports');
  const c = useTranslations('common');
  const tStatus = useTranslations('status');
  // I9 透视表中文显示：status 字段值 → status 命名空间中文（STORY_OPEN→待处理 等）
  const cellLabel = (field: string, value: string) => {
    if (field === 'status') {
      const key = `${pivot?.entity ?? 'STORY'}_${value}`;
      const s = tStatus(key);
      if (s && s !== key) return s;
    }
    return value;
  };
  const [sprintId, setSprintId] = useState('');
  const [groupBy, setGroupBy] = useState<'person' | 'feature' | 'release'>('person');

  // 迭代列表（燃尽图选择器）
  const { data: sprintsData, isLoading: sprintsLoading } = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => sprintsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const sprints = sprintsData ?? [];
  const effectiveSprintId = sprintId || sprints[0]?.id || '';

  // 燃尽图
  const { data: burndown, isLoading: burndownLoading, isError: burndownError } = useQuery({
    queryKey: ['reports-burndown', workspaceId, effectiveSprintId],
    queryFn: () => reportsApi.burndown(workspaceId!, effectiveSprintId).then((r) => r.data),
    enabled: !!workspaceId && !!effectiveSprintId,
  });

  // 速率图
  const { data: velocity, isLoading: velocityLoading, isError: velocityError } = useQuery({
    queryKey: ['reports-velocity', workspaceId],
    queryFn: () => reportsApi.velocity(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 工时报表
  const { data: timeReport, isLoading: timeLoading, isError: timeError } = useQuery({
    queryKey: ['reports-time', workspaceId, groupBy],
    queryFn: () => reportsApi.time(workspaceId!, groupBy).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 产品发现报表（G1-P1）
  const { data: discovery, isLoading: discoveryLoading, isError: discoveryError } = useQuery({
    queryKey: ['reports-discovery', workspaceId],
    queryFn: () => reportsApi.discovery(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 发布质量报表（G1-P1）
  const [releaseId, setReleaseId] = useState('');
  const { data: quality, isLoading: qualityLoading, isError: qualityError } = useQuery({
    queryKey: ['reports-quality', workspaceId, releaseId],
    queryFn: () => reportsApi.quality(workspaceId!, releaseId || undefined).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // I5 测试覆盖率（2026-08-18 P1）
  const { data: coverage, isLoading: coverageLoading, isError: coverageError } = useQuery({
    queryKey: ['reports-coverage', workspaceId, releaseId],
    queryFn: () => reportsApi.coverage(workspaceId!, releaseId || undefined).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 透视表（G1-P2）
  const [pivotCfg, setPivotCfg] = useState<{ entity: 'STORY' | 'SUPPORT' | 'IDEA'; rowField: string; colField: string }>({
    entity: 'STORY',
    rowField: 'status',
    colField: 'priority',
  });
  const [pivotApplied, setPivotApplied] = useState(pivotCfg);
  const { data: pivot, isLoading: pivotLoading, isError: pivotError } = useQuery({
    queryKey: ['reports-pivot', workspaceId, pivotApplied],
    queryFn: () => reportsApi.pivot(workspaceId!, pivotApplied).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // ── 导出（G1-P2）：Excel / PDF ──
  const exportDiscoveryExcel = () => {
    if (!discovery) return;
    const headers = ['类型', '标题', '票数'];
    const rows: (string | number | null | undefined)[][] = [];
    discovery.topEntities.forEach((g) => g.items.forEach((it) => rows.push([g.type, it.title, it.votes])));
    discovery.themes.forEach((th) => rows.push(['THEME', th.title, th.votes]));
    downloadExcel(`discovery-report-${workspaceId?.slice(0, 8)}`, headers, rows);
  };
  const exportDiscoveryPdf = () => {
    if (!discovery) return;
    const headers = ['类型', '标题', '票数'];
    const rows: (string | number | null | undefined)[][] = [];
    discovery.topEntities.forEach((g) => g.items.forEach((it) => rows.push([g.type, it.title, it.votes])));
    downloadPdf(`discovery-report-${workspaceId?.slice(0, 8)}`, headers, rows, '产品发现报表');
  };
  const exportQualityExcel = () => {
    if (!quality) return;
    const headers = ['发布', '状态', '测试数', '通过', '失败', '通过率%', '缺陷数', '逃逸数', '逃逸率%', 'MTTR(h)'];
    const rows: (string | number | null | undefined)[][] = quality.releases.map((r) => [
      r.name,
      r.status,
      r.testStats.total,
      r.testStats.pass,
      r.testStats.fail,
      r.testStats.passRate,
      r.defects.total,
      r.defects.escaped,
      r.defects.escapeRate,
      r.defects.mttrHours,
    ]);
    downloadExcel(`quality-report-${workspaceId?.slice(0, 8)}`, headers, rows);
  };
  const exportPivotExcel = () => {
    if (!pivot) return;
    const headers = [pivot.rowField, ...pivot.colKeys, '合计'];
    const rows: (string | number | null | undefined)[][] = pivot.matrix.map((m) => [
      m.rowKey,
      ...m.cells.map((c) => c.value),
      m.rowTotal,
    ]);
    rows.push(['合计', ...pivot.colTotals.map((c) => c.value), pivot.grandTotal]);
    downloadExcel(`pivot-${pivot.entity}-${pivot.rowField}x${pivot.colField}`, headers, rows);
  };

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BarChart3 className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
        <p className="mb-6 text-muted-foreground">{c('createWsFirst')}</p>
        <Button onClick={() => (window.location.href = '/')}>{c('goCreateHome')}</Button>
      </div>
    );
  }

  const metricLabel = burndown?.metric === 'hours' ? t('metricHours') : t('metricPoints');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('pageTitle')}</h1>
        <p className="text-muted-foreground">{t('pageSubtitle')}</p>
      </div>

      {/* 燃尽图（整行） */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t('burndownTitle')}</CardTitle>
              <CardDescription>{t('burndownDesc')}</CardDescription>
            </div>
            <select
              className="flex h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm"
              value={effectiveSprintId}
              onChange={(e) => setSprintId(e.target.value)}
              disabled={sprintsLoading || sprints.length === 0}
            >
              {sprintsLoading ? (
                <option>{t('loading')}</option>
              ) : (
                sprints.map((s: { id: string; name: string; status: string }) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.status}）
                  </option>
                ))
              )}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {sprints.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('noSprint')}</p>
          ) : (
            <ChartState loading={burndownLoading} error={burndownError} errorText={t('error')} empty={!burndown || burndown.points.length === 0}>
              <p className="mb-2 text-xs text-muted-foreground">
                {metricLabel} · {t('scope')} {burndown?.totalScope} / {burndown?.totalDays} {t('days')}
              </p>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <LineChart data={burndown?.points ?? []} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="remaining" name={t('remaining')} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="ideal" name={t('ideal')} stroke="#c4b5fd" strokeWidth={1.5} strokeDasharray="6 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartState>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 速率图 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t('velocityTitle')}</CardTitle>
            <CardDescription>{t('velocityDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartState loading={velocityLoading} error={velocityError} errorText={t('error')} empty={!velocity || velocity.items.length === 0}>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('avgPerSprint')}: {velocity?.totals.avgPerSprint ?? 0} · {velocity?.totals.points ?? 0} pts / {velocity?.totals.count ?? 0} {t('tasksUnit')}
              </p>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <ComposedChart data={velocity?.items ?? []} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0} angle={-20} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="completedPoints" name={t('completedPoints')} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="avgPoints" name={t('avgPoints', { window: velocity?.window ?? 3 })} stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartState>
          </CardContent>
        </Card>

        {/* 工时报表 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t('timeTitle')}</CardTitle>
                <CardDescription>{t('timeDesc')}</CardDescription>
              </div>
              <select
                className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 text-sm"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as 'person' | 'feature' | 'release')}
              >
                <option value="person">{t('groupByPerson')}</option>
                <option value="feature">{t('groupByFeature')}</option>
                <option value="release">{t('groupByRelease')}</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <ChartState loading={timeLoading} error={timeError} errorText={t('error')} empty={!timeReport || timeReport.items.length === 0}>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('totals')}: 预估 {timeReport?.totals.estimatedHours ?? 0}h · 实际 {timeReport?.totals.actualHours ?? 0}h
              </p>
              <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                <BarChart data={timeReport?.items ?? []} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
                  <XAxis dataKey="key" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0} angle={-20} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="estimatedHours" name={t('estimated')} fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualHours" name={t('actual')} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartState>
          </CardContent>
        </Card>
      </div>

      {/* 产品发现报表（G1-P1 差异化：Zentao/ONES 无此能力） */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t('discoveryTitle')}</CardTitle>
              <CardDescription>{t('discoveryDesc')}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportDiscoveryExcel}>{t('exportExcel')}</Button>
              <Button variant="outline" size="sm" onClick={exportDiscoveryPdf}>{t('exportPdf')}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartState loading={discoveryLoading} error={discoveryError} errorText={t('error')} empty={!discovery || (discovery.topEntities.length === 0 && discovery.themes.length === 0 && discovery.scoreDistribution.length === 0)}>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {/* 投票 Top 榜 */}
              <div className="space-y-4 md:col-span-2">
                {(discovery?.topEntities ?? []).map((g) => (
                  <div key={g.type}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{g.type}</p>
                    {g.items.map((it) => (
                      // I9 图表元素级下钻：点击投票榜条目跳实体详情（IDEA/SUPPORT/FEATURE）
                      <div
                        key={it.id}
                        className="flex cursor-pointer items-center gap-2 rounded py-0.5 transition-colors hover:bg-accent/50"
                        onClick={() => router.push(`/${g.type.toLowerCase()}s/${it.id}`)}
                        title={it.title}
                      >
                        <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{it.votes}</span>
                        <div className="h-4 shrink-0 rounded bg-violet-100" style={{ width: `${Math.max(4, Math.min(97, (it.votes / (g.items[0]?.votes || 1)) * 100))}%` }} />
                        <span className="truncate text-xs">{it.title}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {/* 主题榜 */}
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t('themeRank')}</p>
                {(discovery?.themes ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  (discovery?.themes ?? []).map((th) => (
                    <div
                      key={th.id}
                      className="mb-2 flex cursor-pointer items-center gap-2 transition-colors hover:bg-accent/50"
                      onClick={() => router.push('/themes')}
                      title={th.title}
                    >
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: th.color || '#8b5cf6' }} />
                      <span className="truncate text-xs">{th.title}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{th.votes} {t('themeVotes')}</span>
                    </div>
                  ))
                )}
              </div>
              {/* 评分分布 */}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('scoreDist')}</p>
                {(discovery?.scoreDistribution ?? []).map((s) => (
                  <div key={s.model} className="mb-2 text-xs">
                    <span className="font-medium">{s.model}</span>
                    <span className="text-muted-foreground"> · {t('scoreCount')}: {s.count} · {t('scoreAvg')}: {s.avg}</span>
                    <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-black/5">
                      {s.distribution.map((b) => (
                        <div key={b.label} className="h-full bg-violet-500" style={{ width: `${s.count ? (b.count / s.count) * 100 : 0}%` }} title={`${b.label}: ${b.count}`} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ChartState>
          {/* 反馈→缺陷转化（P2-5 修复：独立于图表空态，conversion 有数据即展示） */}
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border p-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('conversion')} · {t('conversionDesc')}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold">{discovery?.conversion.defectRate ?? 0}%</span>
                <span className="text-xs text-muted-foreground">{t('defectRate')} · {t('openDefect')} {discovery?.conversion.openDefects ?? 0}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(discovery?.conversion.severity ?? {}).map(([k, v]) => (
                <span key={k} className="rounded bg-black/5 px-1.5 py-0.5 text-xs">{k}: {v}</span>
              ))}
              {Object.entries(discovery?.conversion.phases ?? {}).map(([k, v]) => (
                <span key={k} className="rounded bg-violet-50 px-1.5 py-0.5 text-xs">{k}: {v}</span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 发布质量报表（G1-P1） */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t('qualityTitle')}</CardTitle>
              <CardDescription>{t('qualityDesc')}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="flex h-9 w-44 rounded-md border border-input bg-transparent px-3 text-sm"
                value={releaseId}
                onChange={(e) => setReleaseId(e.target.value)}
              >
                <option value="">{t('allReleases')}</option>
                {quality?.releases.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={exportQualityExcel}>{t('exportExcel')}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartState loading={qualityLoading} error={qualityError} errorText={t('error')} empty={!quality || quality.releases.length === 0}>
            <div className="space-y-3">
              {(quality?.selected ? [quality.selected] : (quality?.releases ?? [])).map((r) => (
                <div key={r.id} className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent/40" onClick={() => router.push(`/releases/${r.id}`)}>
                  <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-xs">{r.status}</span>
                    {r.productionDate && <span className="text-xs text-muted-foreground">prod {r.productionDate}</span>}
                  </div>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{t('testExec')}</p>
                      {r.testStats.total === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('noTest')}</p>
                      ) : (
                        <>
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/5">
                            <div className="h-full bg-green-500" style={{ width: `${(r.testStats.pass / r.testStats.total) * 100}%` }} />
                            <div className="h-full bg-red-500" style={{ width: `${(r.testStats.fail / r.testStats.total) * 100}%` }} />
                            <div className="h-full bg-amber-400" style={{ width: `${(r.testStats.blocked / r.testStats.total) * 100}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{t('testPass')} {r.testStats.pass} · {t('testFail')} {r.testStats.fail} · {t('testBlocked')} {r.testStats.blocked}</p>
                          <p className="text-xs">{t('passRate')}: <span className="font-medium">{r.testStats.passRate}%</span></p>
                        </>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{t('defectStat')}</p>
                      {r.defects.total === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('noDefect')}</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(r.defects.severity).map(([k, v]) => (
                            <span key={k} className="rounded bg-black/5 px-1.5 py-0.5 text-xs">{k}: {v}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{t('escapeRate')}</p>
                      <p className="text-lg font-semibold">{r.defects.escapeRate}%</p>
                      <p className="text-xs text-muted-foreground">{t('testFound')} {r.defects.testFound} · {t('escaped')} {r.defects.escaped}</p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{t('mttr')}</p>
                      <p className="text-lg font-semibold">{r.defects.mttrHours}h</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ChartState>
        </CardContent>
      </Card>

      {/* I5 测试覆盖率（2026-08-18 P1） */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('coverageTitle')}</CardTitle>
          <CardDescription>{t('coverageDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartState loading={coverageLoading} error={coverageError} errorText={t('error')} empty={!coverage || coverage.total === 0}>
            {coverage && (
              <div className="space-y-4">
                {/* 总体率 */}
                <div className="flex items-center gap-6 rounded-lg border p-4">
                  <div>
                    <p className="text-3xl font-semibold">{coverage.coverageRate}%</p>
                    <p className="text-xs text-muted-foreground">{t('coverageRate')}</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/5">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${coverage.coverageRate}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t('coverageCovered')} {coverage.covered} / {t('coverageTotal')} {coverage.total}
                    </p>
                  </div>
                </div>
                {/* 按 release */}
                {coverage.byRelease.filter((r) => r.total > 0).length > 0 && (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{t('coverageRelease')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('coverageTotal')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('coverageCovered')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('coverageRate')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coverage.byRelease.filter((r) => r.total > 0).map((r) => (
                          <tr key={r.id} className="cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/40" onClick={() => router.push(`/releases/${r.id}`)}>
                            <td className="px-3 py-1.5">{r.name}{r.version ? ` (${r.version})` : ''}</td>
                            <td className="px-3 py-1.5 text-right">{r.total}</td>
                            <td className="px-3 py-1.5 text-right">{r.covered}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{r.rate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* 类型分布 */}
                {coverage.byType.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {coverage.byType.map((x) => (
                      <span key={x.type} className="rounded-md border px-2 py-1 text-xs">
                        {x.type}: <b>{x.rate}%</b>
                        <span className="text-muted-foreground"> ({x.covered}/{x.total})</span>
                      </span>
                    ))}
                  </div>
                )}
                {/* 未覆盖 Story */}
                {coverage.uncovered.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t('coverageUncovered')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {coverage.uncovered.slice(0, 10).map((u) => (
                        <span key={u.id} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                          {u.code || u.title.slice(0, 24)}{u.release ? ` · ${u.release}` : ''}
                        </span>
                      ))}
                      {coverage.uncovered.length > 10 && (
                        <span className="text-xs text-muted-foreground">+{coverage.uncovered.length - 10}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ChartState>
        </CardContent>
      </Card>
      {/* 透视表 / 交叉分析（G1-P2） */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">{t('pivotTitle')}</CardTitle>
              <CardDescription>{t('pivotDesc')}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={pivotCfg.entity}
                onChange={(e) => {
                  const entity = e.target.value as 'STORY' | 'SUPPORT' | 'IDEA';
                  const d = PIVOT_DIMS[entity];
                  setPivotCfg({ entity, rowField: d[0].field, colField: d[1].field });
                }}
              >
                <option value="STORY">Story</option>
                <option value="SUPPORT">Support</option>
                <option value="IDEA">Idea</option>
              </select>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={pivotCfg.rowField}
                onChange={(e) => setPivotCfg({ ...pivotCfg, rowField: e.target.value })}
              >
                {PIVOT_DIMS[pivotCfg.entity].map((d) => (
                  <option key={d.field} value={d.field} disabled={d.field === pivotCfg.colField}>{d.label}</option>
                ))}
              </select>
              <select
                className="flex h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={pivotCfg.colField}
                onChange={(e) => setPivotCfg({ ...pivotCfg, colField: e.target.value })}
              >
                {PIVOT_DIMS[pivotCfg.entity].map((d) => (
                  <option key={d.field} value={d.field} disabled={d.field === pivotCfg.rowField}>{d.label}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => setPivotApplied(pivotCfg)}>{t('pivotLoad')}</Button>
              <Button variant="outline" size="sm" onClick={exportPivotExcel}>{t('exportExcel')}</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ChartState loading={pivotLoading} error={pivotError} errorText={t('error')} empty={!pivot || pivot.rowKeys.length === 0}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-muted-foreground">{PIVOT_DIMS[pivot?.entity as 'STORY' | 'SUPPORT' | 'IDEA']?.find((d) => d.field === pivot?.rowField)?.label ?? pivot?.rowField}</th>
                    {pivot?.colKeys.map((ck) => (
                      <th key={ck} className="px-2 py-1 text-right font-medium">{cellLabel(pivot.colField, ck)}</th>
                    ))}
                    <th className="px-2 py-1 text-right font-medium">{t('grandTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot?.matrix.map((m) => (
                    <tr key={m.rowKey} className="border-t">
                      <td className="px-2 py-1">{cellLabel(pivot.rowField, m.rowKey)}</td>
                      {m.cells.map((cl) => (
                        <td key={cl.colKey} className="px-2 py-1 text-right">{cl.value || ''}</td>
                      ))}
                      <td className="px-2 py-1 text-right font-medium">{m.rowTotal}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    <td className="px-2 py-1">{t('grandTotal')}</td>
                    {pivot?.colTotals.map((ct) => (
                      <td key={ct.colKey} className="px-2 py-1 text-right">{ct.value}</td>
                    ))}
                    <td className="px-2 py-1 text-right">{pivot?.grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ChartState>
        </CardContent>
      </Card>
    </div>
  );
}

const PIVOT_DIMS: Record<'STORY' | 'SUPPORT' | 'IDEA', Array<{ label: string; field: string }>> = {
  STORY: [
    { label: '状态', field: 'status' },
    { label: '优先级', field: 'priority' },
    { label: '负责人', field: 'assigneeName' },
    { label: '类型', field: 'kind' },
  ],
  SUPPORT: [
    { label: '状态', field: 'status' },
    { label: '严重度', field: 'severity' },
    { label: '类型', field: 'type' },
    { label: '发现阶段', field: 'discoveryPhase' },
  ],
  IDEA: [
    { label: '状态', field: 'status' },
    { label: '负责人', field: 'assigneeName' },
    { label: '分类', field: 'category' },
  ],
};
