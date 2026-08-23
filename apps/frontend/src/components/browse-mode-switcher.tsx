'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface BrowseModeOption {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface BrowseModeSwitcherProps {
  options: BrowseModeOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * 统一的浏览模式切换器（清单 / 按状态 / 按发布周期）
 * 与 Story 页原有 segmented control 样式保持一致。
 */
export default function BrowseModeSwitcher({
  options,
  value,
  onChange,
  className,
}: BrowseModeSwitcherProps) {
  return (
    <div className={cn('inline-flex rounded-lg border bg-muted/30 p-0.5', className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === opt.id
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
