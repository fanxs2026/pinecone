'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ganttApi, releaseApi, type GanttRelease } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useTranslations } from 'next-intl';

/** Release 状态 → Aha 柔和色（深色文字） */
const STATUS_STYLE: Record<string, { fill: string; text: string }> = {
  PLANNING: { fill: '#dbeafe', text: '#1e40af' },
  IN_DEVELOPMENT: { fill: '#fef3c7', text: '#92400e' },
  IN_TESTING: { fill: '#fce7f3', text: '#9d174d' },
  RELEASED: { fill: '#d1fae5', text: '#065f46' },
  DELAYED: { fill: '#fee2e2', text: '#991b1b' },
  ARCHIVED: { fill: '#e5e7eb', text: '#374151' },
};
const FALLBACK_STYLE = { fill: '#e0e7ff', text: '#3730a3' };

const ROW_H = 46;
const LABEL_W = 210;
const HEADER_H = 36;
const PAD = 12;
const EDGE_PX = 8; // 边缘拉伸命中区
const DAY_MS = 86400000;

type DragKind = 'move' | 'resize-start' | 'resize-end' | 'milestone-stage' | 'milestone-prod';

interface DragState {
  kind: DragKind;
  releaseId: string;
  startX: number;
  orig: { start?: string | null; end?: string | null; stage?: string | null; prod?: string | null };
}

type DatePatch = { startDate?: string; endDate?: string; stageDate?: string; productionDate?: string };

/** 发布计划页内嵌甘特视图（可拖拽：整条平移 / 边缘拉伸 / 里程碑改期） */
export function ReleasesGantt() {
  const t = useTranslations('gantt');
  const { workspaceId } = useWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: releases, isLoading } = useQuery({
    queryKey: ['gantt', workspaceId],
    queryFn: () => ganttApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 拖拽本地状态：drag 描述当前手势；preview 为提交前的临时日期
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Record<string, DatePatch>>({});
  const svgRef = useRef<SVGSVGElement | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: DatePatch }) =>
      releaseApi.update(workspaceId!, id, patch).then((r) => r.data),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['gantt', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['releases', workspaceId] });
      setPreview({});
    },
  });

  const { min, max, days, pxPerDay } = useMemo(() => {
    const dated = (releases ?? []).filter((r) => r.startDate && r.endDate);
    const today = new Date();
    let lo: Date, hi: Date;
    if (dated.length > 0) {
      lo = new Date(Math.min(...dated.map((r) => new Date(r.startDate!).getTime())));
      hi = new Date(Math.max(...dated.map((r) => new Date(r.endDate!).getTime())));
      lo = new Date(lo.getFullYear(), lo.getMonth() - 1, 1);
      hi = new Date(hi.getFullYear(), hi.getMonth() + 2, 0);
    } else {
      lo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      hi = new Date(today.getFullYear(), today.getMonth() + 4, 0);
    }
    const daysTotal = Math.max(30, Math.round((hi.getTime() - lo.getTime()) / DAY_MS) + 1);
    const width = LABEL_W + Math.max(600, daysTotal * 7);
    return { min: lo, max: hi, days: daysTotal, pxPerDay: (width - LABEL_W) / daysTotal, width };
  }, [releases]);

  const x = useCallback(
    (d: Date | string | null | undefined) => {
      if (!d) return NaN;
      const dt = typeof d === 'string' ? new Date(d) : d;
      return LABEL_W + ((dt.getTime() - min.getTime()) / DAY_MS) * pxPerDay;
    },
    [min, pxPerDay],
  );

  const dateAtX = useCallback(
    (px: number) => new Date(min.getTime() + ((px - LABEL_W) / pxPerDay) * DAY_MS),
    [min, pxPerDay],
  );

  const months = useMemo(() => {
    const arr: { label: string; xPos: number }[] = [];
    const cur = new Date(min.getFullYear(), min.getMonth(), 1);
    while (cur <= max) {
      arr.push({ label: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`, xPos: x(cur) });
      cur.setMonth(cur.getMonth() + 1);
    }
    return arr;
  }, [min, max, x]);

  const todayX = x(new Date());
  const ganttHeight = HEADER_H + (releases?.length ?? 0) * ROW_H + PAD;

  // ---- 拖拽手势 ----
  const onPointerDown = useCallback((e: React.PointerEvent, r: GanttRelease, kind: DragKind) => {
    e.preventDefault();
    const target = e.currentTarget as Element;
    target.setPointerCapture?.(e.pointerId);
    setDrag({ kind, releaseId: r.id, startX: e.clientX, orig: { start: r.startDate, end: r.endDate, stage: r.stageDate, prod: r.productionDate } });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      if (!rect) return;
      // 相对 SVG 内容坐标（滚动区偏移由 svg 位置决定；简化：用 clientX 差值算天数）
      const deltaDays = Math.round((e.clientX - drag.startX) / pxPerDay);
      const shift = (d: string | null | undefined) => {
        if (!d) return undefined;
        return new Date(new Date(d).getTime() + deltaDays * DAY_MS).toISOString().slice(0, 10);
      };
      let patch: DatePatch = {};
      switch (drag.kind) {
        case 'move':
          patch = { startDate: shift(drag.orig.start), endDate: shift(drag.orig.end) };
          break;
        case 'resize-start':
          patch = { startDate: shift(drag.orig.start) }; // end 不变
          break;
        case 'resize-end':
          patch = { endDate: shift(drag.orig.end) }; // start 不变
          break;
        case 'milestone-stage':
          patch = { stageDate: shift(drag.orig.stage) };
          break;
        case 'milestone-prod':
          patch = { productionDate: shift(drag.orig.prod) };
          break;
      }
      setPreview((p) => ({ ...p, [drag.releaseId]: patch }));
    };

    const onUp = () => {
      setDrag((d) => {
        if (d) {
          const p = preview[d.releaseId];
          if (p && Object.values(p).some(Boolean)) {
            updateMutation.mutate({ id: d.releaseId, patch: p });
          }
        }
        return null;
      });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, pxPerDay, preview]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if ((releases?.length ?? 0) === 0) {
    return <div className="py-12 text-center text-muted-foreground">{t('empty')}</div>;
  }

  const isDragging = (id: string) => drag?.releaseId === id;

  return (
    <div className="overflow-x-auto">
      <svg ref={svgRef} width={widthPx()} height={ganttHeight} className="min-w-full select-none">
        {/* 网格线 */}
        {months.map((m, i) => (
          <g key={i}>
            <line x1={m.xPos} y1={HEADER_H} x2={m.xPos} y2={ganttHeight} stroke="#f1f5f9" strokeWidth={1} />
            <text x={m.xPos + 4} y={HEADER_H - 10} fontSize={11} fill="#64748b">{m.label}</text>
          </g>
        ))}
        {/* 今天竖线 */}
        <line x1={todayX} y1={HEADER_H} x2={todayX} y2={ganttHeight} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={todayX + 4} y={HEADER_H - 22} fontSize={10} fill="#ef4444">{t('today')}</text>

        {/* G8 依赖连线：预计算每行位置 */}
        {(() => {
          const rowPos = new Map<string, { x1: number; x2: number; midY: number }>();
          (releases ?? []).forEach((r, i) => {
            const y = HEADER_H + i * ROW_H;
            const midY = y + ROW_H / 2 - 7;
            const hasDates = !!(r.startDate && r.endDate);
            const x1 = hasDates ? x(new Date(r.startDate!)) : PAD;
            const x2 = hasDates ? x(new Date(r.endDate!)) : PAD;
            rowPos.set(r.id, { x1, x2, midY });
          });
          const deps = (releases ?? []).filter((r) => r.dependsOnId && rowPos.has(r.dependsOnId!) && rowPos.has(r.id));
          if (deps.length === 0) return null;
          return (
            <g key="deps">
              {deps.map((r) => {
                const from = rowPos.get(r.dependsOnId!)!;
                const to = rowPos.get(r.id)!;
                const fx = from.x2;
                const fy = from.midY + 7;
                const tx = Math.max(to.x1 - 6, fx + 8);
                const ty = to.midY + 7;
                const bendY = (fy + ty) / 2;
                return (
                  <g key={`dep-${r.id}`}>
                    <title>{`${r.name} 依赖 ${r.dependsOnName ?? ''}`}</title>
                    <path
                      d={`M ${fx} ${fy} L ${fx} ${bendY} L ${tx} ${bendY} L ${tx} ${ty - 4}`}
                      fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="3 2"
                    />
                    <polygon points={`${tx - 4} ${ty - 5},${tx + 4} ${ty - 5},${tx} ${ty + 3}`} fill="#94a3b8" />
                  </g>
                );
              })}
            </g>
          );
        })()}

        {/* 行 */}
        {(releases ?? []).map((r, i) => {
          const y = HEADER_H + i * ROW_H;
          const style = STATUS_STYLE[r.status] ?? FALLBACK_STYLE;
          const p = preview[r.id] ?? {};
          const startDate = p.startDate ?? r.startDate;
          const endDate = p.endDate ?? r.endDate;
          const stageDate = p.stageDate ?? r.stageDate;
          const productionDate = p.productionDate ?? r.productionDate;
          const hasDates = !!(startDate && endDate);
          const midY = y + ROW_H / 2 - 7;
          const dragging = isDragging(r.id);
          const cursor = dragging ? 'grabbing' : hasDates ? 'grab' : 'default';

          // 无日期：只读占位（不支持拖拽）
          if (!hasDates) {
            const x1 = x(new Date());
            const x2 = x(new Date(Date.now() + 28 * DAY_MS));
            return (
              <g key={r.id} opacity={0.75}>
                <text x={PAD} y={midY + 5} fontSize={12.5} fontWeight={600} fill="#0f172a">{r.name}</text>
                <text x={PAD} y={midY + 18} fontSize={10} fill="#64748b">
                  {[r.version, `任务 ${r.storyCount}`, `功能 ${r.featureCount}`, `缺陷 ${r.supportCount}`].filter(Boolean).join(' · ')}
                </text>
                <rect x={x1} y={midY} width={Math.max(6, x2 - x1)} height={14} rx={7} fill="#e2e8f0" />
                <text x={x1 + Math.max(6, x2 - x1) + 6} y={midY + 10} fontSize={10} fill="#94a3b8">{t('unscheduled')}</text>
              </g>
            );
          }

          const x1 = x(startDate!);
          const x2 = x(endDate!);
          const barW = Math.max(6, x2 - x1);
          const milestones: { d?: string | null; kind: 'milestone-stage' | 'milestone-prod'; color: string }[] = [
            { d: stageDate, kind: 'milestone-stage', color: '#3b82f6' },
            { d: productionDate, kind: 'milestone-prod', color: '#10b981' },
          ];

          return (
            <g key={r.id} opacity={dragging ? 0.85 : 1}>
              {/* 标签列 */}
              <text x={PAD} y={midY + 5} fontSize={12.5} fontWeight={600} fill="#0f172a">{r.name}</text>
              <text x={PAD} y={midY + 18} fontSize={10} fill="#64748b">
                {[r.version, `任务 ${r.storyCount}`, `功能 ${r.featureCount}`, `缺陷 ${r.supportCount}`].filter(Boolean).join(' · ')}
              </text>

              {/* 条主体（拖动整条；双击下钻详情） */}
              <rect
                x={x1} y={midY} width={barW} height={14} rx={7}
                fill={style.fill} stroke={style.text} strokeWidth={0.8}
                style={{ cursor, touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown(e, r, 'move')}
                onDoubleClick={() => router.push(`/releases/${r.id}`)}
              >
                <title>{`${r.name}（双击查看详情）`}</title>
              </rect>
              {/* 左边缘（拉伸起始） */}
              <rect
                x={x1 - EDGE_PX / 2} y={midY - 2} width={EDGE_PX} height={18} rx={3}
                fill="transparent" style={{ cursor: 'col-resize', touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown(e, r, 'resize-start')}
              />
              {/* 右边缘（拉伸结束） */}
              <rect
                x={x2 - EDGE_PX / 2} y={midY - 2} width={EDGE_PX} height={18} rx={3}
                fill="transparent" style={{ cursor: 'col-resize', touchAction: 'none' }}
                onPointerDown={(e) => onPointerDown(e, r, 'resize-end')}
              />
              {/* 状态文字 */}
              <text x={Math.min(x1 + barW + 4, widthPx() - 40)} y={midY + 10} fontSize={9.5} fill={style.text}>{r.status.replace(/_/g, ' ')}</text>

              {/* 里程碑（可拖拽改期） */}
              {milestones.filter((m) => m.d).map((m, mi) => (
                <polygon
                  key={mi}
                  points={`${x(m.d!)} ${midY - 4},${x(m.d!) + 5} ${midY + 7},${x(m.d!)} ${midY + 18},${x(m.d!) - 5} ${midY + 7}`}
                  fill={m.color} opacity={0.9}
                  style={{ cursor: 'move', touchAction: 'none' }}
                  onPointerDown={(e) => onPointerDown(e, r, m.kind)}
                >
                  <title>{`${m.kind === 'milestone-stage' ? t('milestoneStage') : t('milestoneProd')} ${new Date(m.d!).toISOString().slice(0, 10)}`}</title>
                </polygon>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-blue-500" />{t('milestoneStage')}</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />{t('milestoneProd')}</span>
        <Badge variant="outline">{t('draggable')}</Badge>
      </div>
    </div>
  );

  // width 由 days 决定（与 useMemo 一致）
  function widthPx() {
    return LABEL_W + Math.max(600, days * 7);
  }
}
