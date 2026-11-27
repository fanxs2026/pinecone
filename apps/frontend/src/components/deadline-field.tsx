'use client';

import { useTranslations } from 'next-intl';
import DateInput from '@/components/date-input';
import { computeDeadlineRisk, type DeadlineRisk, type DeadlineRiskResult } from '@/lib/deadline-risk';

/**
 * 交付时限行：日期输入 + 风险标识。
 *
 * 有效截止日可能来自迭代或发布的结束日（回退），此时日期输入框仍只展示
 * 用户显式填写的承诺日，回退来源以说明文字标注，避免把推算值误当成已设置。
 */
interface Props {
  value: string | null | undefined;
  status: string;
  entityType: 'STORY' | 'FEATURE' | 'SUPPORT';
  startedAt?: string | null;
  fallbackDueDate?: string | null;
  fallbackTier?: 'sprint' | 'release' | null;
  onSave: (dueDate: string | null) => void;
  disabled?: boolean;
}

const RISK_CLASSES: Record<Exclude<DeadlineRisk, 'NONE' | 'DONE'>, string> = {
  GREEN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  YELLOW: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  RED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  OVERDUE: 'bg-destructive text-destructive-foreground',
};

/**
 * 列表/卡片用的风险标记：只呈现「已逾期」与「高危」两类。
 * 列表里铺满绿黄红会让颜色失去意义，所以正常与接近截止都不标。
 */
export function DeadlineRiskChip({ result }: { result: DeadlineRiskResult }) {
  const t = useTranslations('deadline');

  if (result.risk === 'OVERDUE') {
    return (
      <span className="shrink-0 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
        {t('riskOverdue', { days: result.overdueDays || 1 })}
      </span>
    );
  }
  if (result.risk === 'RED') {
    return (
      <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
        {t('riskRed')}
      </span>
    );
  }
  return null;
}

export function DeadlineField({
  value,
  status,
  entityType,
  startedAt,
  fallbackDueDate,
  fallbackTier,
  onSave,
  disabled,
}: Props) {
  const t = useTranslations('deadline');

  const ownDate = value ? String(value).slice(0, 10) : '';
  const { risk, effectiveDue, overdueDays } = computeDeadlineRisk({
    status,
    entityType,
    dueDate: value,
    startedAt,
    fallbackDueDate,
  });

  const riskLabel = (() => {
    if (risk === 'OVERDUE') return t('riskOverdue', { days: overdueDays || 1 });
    if (risk === 'GREEN') return t('riskGreen');
    if (risk === 'YELLOW') return t('riskYellow');
    if (risk === 'RED') return t('riskRed');
    return null;
  })();

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="w-20 shrink-0 text-sm text-muted-foreground">{t('label')}</span>

      {/* 固定显示 yyyy-mm-dd：原生 date 控件会按系统语言显示 2026/11/25 */}
      <DateInput
        value={ownDate}
        disabled={disabled}
        onChange={(v) => onSave(v || null)}
        className="w-[150px]"
      />

      {riskLabel && (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_CLASSES[risk as keyof typeof RISK_CLASSES]}`}
        >
          {riskLabel}
        </span>
      )}

      {!ownDate && effectiveDue && (
        <span className="text-xs text-muted-foreground">
          {fallbackTier === 'release' ? t('fromRelease') : t('fromSprint')}
        </span>
      )}
    </div>
  );
}
