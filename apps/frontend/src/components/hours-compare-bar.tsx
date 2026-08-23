'use client';

import { useTranslations } from 'next-intl';

/**
 * 工时比对条（2026-08-14 v2）：
 * 蓝 = 预计工作量（estimateHours），绿 = 实际已记录工时（loggedHours）。
 * 上下排列（预计上 / 实际下）、左对齐、窄条（w-14 ≈ 56px，原宽一半）。
 * 条上不显示数字，鼠标悬浮（title tooltip）才显示具体小时数。
 * 两者都无 → 显示「—」。
 * 复用于：Story 列表页（stories/page.tsx）、子任务列表（subtasks-section.tsx）。
 */
export function HoursCompareBar({ estimated, logged }: { estimated: number; logged: number }) {
  const t = useTranslations('stories');
  const hasEstimated = estimated > 0;
  const hasLogged = logged > 0;
  if (!hasEstimated && !hasLogged) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // 填充比例：以两者较大值为基准（左对齐，窄条从左侧填充）
  const max = Math.max(estimated, logged, 1);
  const estPct = hasEstimated ? Math.max((estimated / max) * 100, 6) : 0;
  const logPct = hasLogged ? Math.max((logged / max) * 100, 6) : 0;

  return (
    <div
      className="w-14 cursor-help"
      title={`${t('hoursEstimated')}: ${estimated}h · ${t('hoursLogged')}: ${logged}h`}
    >
      {/* 预计（蓝）上 */}
      <div className="mb-0.5 h-1.5 w-full overflow-hidden rounded-sm bg-muted">
        <div className="h-full bg-blue-500" style={{ width: `${estPct}%` }} />
      </div>
      {/* 实际（绿）下 */}
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted">
        <div className="h-full bg-green-500" style={{ width: `${logPct}%` }} />
      </div>
    </div>
  );
}
