'use client';

import { cn } from '@/lib/utils';

export interface UnderlineTabItem {
  key: string;
  label: string;
}

interface Props {
  tabs: UnderlineTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /** 小尺寸（用于卡片内嵌切换，如 SSO 类型选择） */
  size?: 'sm' | 'md';
}

/** 下划线页签：下划线在谁下面，谁就是当前显示的页签 */
export function UnderlineTabs({ tabs, activeKey, onChange, size = 'md' }: Props) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              '-mb-px cursor-pointer whitespace-nowrap border-b-2 transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm',
              active
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
