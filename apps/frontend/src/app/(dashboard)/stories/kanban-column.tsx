'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';

interface CapacityInfo {
  usedDays: number;     // sum of effortEstimate (hours) / 8, rounded
  totalDays: number;    // totalCapacity from release
}

interface KanbanColumnProps {
  id: string;
  title: string;
  children: React.ReactNode;
  count: number;
  className?: string;
  capacity?: CapacityInfo;
  wipLimit?: number | null;
}

export default function KanbanColumn({ id, title, children, count, className, capacity, wipLimit }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const t = useTranslations('detail');

  const pct = capacity ? Math.min(Math.round((capacity.usedDays / capacity.totalDays) * 100), 100) : 0;
  const barColor = capacity
    ? pct >= 100 ? 'bg-red-500'
      : pct >= 80 ? 'bg-yellow-500'
      : 'bg-green-500'
    : '';

  // WIP 状态：超限 / 接近上限 / 正常
  const wipOver = wipLimit != null && count > wipLimit;
  const wipNear = wipLimit != null && !wipOver && count >= Math.round(wipLimit * 0.8);

  return (
    <div
      ref={setNodeRef}
        className={cn(
          'flex h-full flex-col rounded-lg border-2 p-3 shrink-0 min-w-[336px] w-[336px] max-w-[336px]',
          isOver ? 'border-primary ring-2 ring-primary/20' : 'border-transparent',
          className,
        )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-1.5">
          {wipLimit != null && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                wipOver ? 'bg-red-100 text-red-700' : wipNear ? 'bg-yellow-100 text-yellow-700' : 'bg-muted text-muted-foreground',
              )}
            >
              {count}/{wipLimit} WIP
            </span>
          )}
          <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        </div>
      </div>

      {wipOver && (
        <div className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          {t('wipExceeded')}
        </div>
      )}

      {capacity && (
        <div className="mb-2 group relative">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-0.5">
            <span>{t('capacity')}</span>
            <span>{capacity.usedDays}/{capacity.totalDays} {t('personDay')}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300', barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}
