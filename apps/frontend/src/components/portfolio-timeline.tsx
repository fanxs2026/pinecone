'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { releaseApi, featureApi } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

const ROW_H = 40;
const LABEL_W = 200;
const HEADER_H = 64;
const DAY_MS = 86400000;

const RELEASE_FILL: Record<string, string> = {
  PLANNING: '#dbeafe',
  IN_DEVELOPMENT: '#fef3c7',
  IN_TESTING: '#fce7f3',
  RELEASED: '#d1fae5',
  DELAYED: '#fee2e2',
  ARCHIVED: '#e5e7eb',
};
const FALLBACK = '#e0e7ff';
const RELEASE_TEXT: Record<string, string> = {
  PLANNING: '#1e40af',
  IN_DEVELOPMENT: '#92400e',
  IN_TESTING: '#9d174d',
  RELEASED: '#065f46',
  DELAYED: '#991b1b',
  ARCHIVED: '#374151',
};

interface TimelineItem {
  id: string;
  label: string;
  code?: string;
  start: number; // ms
  end: number; // ms
  fill: string;
  text: string;
  isRelease?: boolean;
  status?: string;
}

/** P2-⑬ 跨发布组合时间线：Epic（顶层 Feature）分组行，子 Feature 按所属 Release 定位时间条 */
export function PortfolioTimeline() {
  const t = useTranslations('portfolio');
  const { workspaceId } = useWorkspace();

  const { data: releasesRes, isLoading: relLoading } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const { data: featuresRes, isLoading: featLoading } = useQuery({
    queryKey: ['features', workspaceId],
    queryFn: () => featureApi.list(workspaceId!, { pageSize: 200 }).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { releases, features, minDate, maxDate, items, epics } = useMemo(() => {
    const rels = (releasesRes?.items ?? []).filter((r) => r.startDate && r.endDate);
    const feats = featuresRes?.items ?? [];
    const epicsList = feats.filter((f) => f.isEpic);

    // 时间范围：Release 起止 + Feature 所属 Release 的日期
    const dates = rels.flatMap((r) => [new Date(r.startDate!).getTime(), new Date(r.endDate!).getTime()]);
    if (dates.length === 0) return { releases: rels, features: feats, minDate: 0, maxDate: 0, items: [], epics: epicsList };
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);

    // 每个 Epic 行的 items：其子 Feature（含直属）按 release 定位
    const items: TimelineItem[] = [];
    for (const epic of epicsList) {
      const children = feats.filter((f) => f.parentFeatureId === epic.id);
      const epicItems: TimelineItem[] = [];
      for (const f of children) {
        const rel = rels.find((r) => r.id === f.releaseId);
        if (!rel || !rel.startDate || !rel.endDate) continue;
        epicItems.push({
          id: f.id,
          label: f.title,
          code: f.code,
          start: new Date(rel.startDate).getTime(),
          end: new Date(rel.endDate).getTime(),
          fill: RELEASE_FILL[rel.status] ?? FALLBACK,
          text: RELEASE_TEXT[rel.status] ?? '#3730a3',
          status: rel.status,
        });
      }
      items.push(...epicItems.map((it) => ({ ...it, epicId: epic.id, epicTitle: epic.title } as TimelineItem & { epicId: string; epicTitle: string })));
    }
    return { releases: rels, features: feats, minDate, maxDate, items, epics: epicsList };
  }, [releasesRes, featuresRes]);

  if (relLoading || featLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (minDate === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>;
  }

  const totalSpan = maxDate - minDate;
  const x = (ms: number) => LABEL_W + ((ms - minDate) / totalSpan) * (800 - LABEL_W);
  const w = (ms: number) => Math.max(24, ((ms) / totalSpan) * (800 - LABEL_W));

  // Release 泳道（顶部背景条）
  const releaseBands = releases.map((r) => ({
    ...r,
    left: x(new Date(r.startDate!).getTime()),
    width: w(new Date(r.endDate!).getTime() - new Date(r.startDate!).getTime()),
  }));

  // 按 epic 分组（epics 里没子 feature 的也展示，行高留空）
  const epicRows = epics.map((epic) => ({
    epic,
    children: items.filter((it) => (it as any).epicId === epic.id),
  }));

  return (
    <div className="overflow-x-auto">
      <div style={{ width: 800 }} className="min-w-full">
        {/* 表头：时间轴 */}
        <div className="flex" style={{ height: HEADER_H }}>
          <div className="shrink-0 border-b border-border px-3 pt-4 text-xs font-medium text-muted-foreground" style={{ width: LABEL_W }}>
            {t('epicColumn')}
          </div>
          <div className="relative flex-1 border-b border-border">
            {/* 月份刻度 */}
            {(() => {
              const months: Array<{ label: string; left: number }> = [];
              const d = new Date(minDate);
              d.setDate(1);
              while (d.getTime() <= maxDate) {
                const mLeft = x(d.getTime());
                if (mLeft >= LABEL_W) {
                  months.push({ label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, left: mLeft });
                }
                d.setMonth(d.getMonth() + 1);
              }
              return months.map((m, i) => (
                <span key={i} className="absolute top-1 text-[10px] text-muted-foreground" style={{ left: m.left }}>
                  {m.label}
                </span>
              ));
            })()}
            {/* Release 背景条 */}
            {releaseBands.map((rb) => (
              <div
                key={rb.id}
                className="absolute top-6 h-4 overflow-hidden rounded-sm border border-black/5 px-1"
                style={{ left: rb.left, width: rb.width, backgroundColor: RELEASE_FILL[rb.status] ?? FALLBACK }}
                title={`${rb.name}${rb.version ? ` (${rb.version})` : ''}`}
              >
                <span className="block truncate text-[9px] font-medium" style={{ color: RELEASE_TEXT[rb.status] ?? '#3730a3' }}>
                  {rb.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Epic 行 */}
        {epicRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('noEpics')}</p>
        ) : (
          epicRows.map(({ epic, children }) => (
            <div key={epic.id} className="flex border-b border-border/60" style={{ minHeight: ROW_H }}>
              <div className="shrink-0 border-r border-border/40 px-3 py-2" style={{ width: LABEL_W }}>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="bg-violet-50 text-violet-700 text-[10px]">EPIC</Badge>
                  <span className="truncate text-sm font-medium">{epic.title}</span>
                </div>
              </div>
              <div className="relative flex-1" style={{ minHeight: ROW_H }}>
                {children.map((it) => (
                  <div
                    key={it.id}
                    className="absolute top-1/2 -translate-y-1/2 overflow-hidden rounded px-1.5 py-0.5"
                    style={{
                      left: x(it.start),
                      width: w(it.end - it.start),
                      backgroundColor: it.fill,
                      color: it.text,
                    }}
                    title={`${it.code ? it.code + ' ' : ''}${it.label}`}
                  >
                    <span className="block truncate text-[10px] font-medium">{it.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
