'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DateInputProps {
  /** 值：yyyy-MM-dd（也接受 ISO 串，自动截前 10 位） */
  value?: string | null;
  /** 提交时机：失焦 / 回车 / 日历选中（不是每次按键） */
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 统一的日期输入框（2026-11-27）。
 *
 * 为什么不用 `<input type="date">`：
 *   原生控件的显示格式由浏览器/系统语言决定 —— 中文环境显示 `2026/11/25`，
 *   英文环境显示 `11/25/2026`，且无法通过 CSS 或 lang 属性改变。
 *   产品要求固定 `yyyy-mm-dd`，所以改成文本框 + 隐藏的原生 picker：
 *   - 正文永远是 yyyy-mm-dd
 *   - 右侧日历按钮调 showPicker()，保留点选日期的体验
 *   - 手输容忍 2026-1-5 / 2026/1/5 / 2026.1.5，提交时归一
 */
export default function DateInput({
  value,
  onChange,
  className,
  disabled,
  autoFocus,
  placeholder = 'yyyy-mm-dd',
}: DateInputProps) {
  const current = (value ?? '').slice(0, 10);
  const [text, setText] = useState(current);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText((value ?? '').slice(0, 10));
  }, [value]);

  const commit = (raw: string) => {
    const s = raw.trim();
    if (!s) {
      setText('');
      if (current) onChange('');
      return;
    }
    const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
    if (!m) {
      setText(current); // 无法解析：回退到上一个有效值，不提交
      return;
    }
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    setText(iso);
    if (iso !== current) onChange(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof (el as any).showPicker === 'function') (el as any).showPicker();
      else el.focus();
    } catch {
      el.focus();
    }
  };

  return (
    <div className={cn('relative inline-flex items-center', className)}>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') setText(current);
        }}
        className="h-8 w-full rounded-md border border-input bg-transparent pl-2 pr-7 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        aria-label="选择日期"
        className="absolute right-0.5 flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <Calendar className="h-3.5 w-3.5" />
      </button>
      {/* 隐藏的原生 picker：只用于弹出日历，值由上面的文本框承载 */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={ISO_DATE.test(text) ? text : ''}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (v !== current) onChange(v);
        }}
        className="pointer-events-none absolute bottom-0 right-1 h-0 w-0 opacity-0"
      />
    </div>
  );
}
