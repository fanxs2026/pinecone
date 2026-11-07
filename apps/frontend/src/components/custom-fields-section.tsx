'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  customFieldApi,
  type CustomFieldDef,
  type CustomFieldEntityType,
} from '@/lib/api-client';

/**
 * 自定义属性区块。
 *
 * 复用详情页既有的行式字段布局（label 80px + 值），本身不画分隔线，
 * 由外层容器（CardContent 的 divide-y）控制行间留白与分隔。
 *
 * - 不传 onSubmit：只读模式，隐藏空值，没有任何字段时整体不渲染。
 * - 传 onSubmit：可编辑，改动即提交（文本框在失焦/回车时提交）。
 */
interface Props {
  workspaceId: string | null;
  entityType: CustomFieldEntityType;
  value: Record<string, unknown> | null | undefined;
  onSubmit?: (next: Record<string, unknown>) => void;
  showEmptyInReadonly?: boolean;
  disabled?: boolean;
  /** row：详情页行式（label 80px + 值）；stack：表单内垂直排列 */
  layout?: 'row' | 'stack';
}

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function formatValue(def: CustomFieldDef, v: unknown): string {
  if (isEmptyValue(v)) return '';
  if (def.type === 'CHECKBOX') return v === true ? '✓' : '—';
  if (def.type === 'SELECT') {
    const hit = def.options?.find((o) => o.value === v);
    return hit?.label ?? String(v);
  }
  if (def.type === 'MULTI_SELECT') {
    const list = Array.isArray(v) ? v : [];
    return list
      .map((item) => def.options?.find((o) => o.value === item)?.label ?? String(item))
      .join(' / ');
  }
  if (def.type === 'DATE') return String(v).slice(0, 10);
  return String(v);
}

/** 文本类控件：本地草稿，失焦或回车提交，避免每次按键都发请求 */
function DraftTextInput({
  initial,
  type,
  onCommit,
  disabled,
  fullWidth,
}: {
  initial: string;
  type: 'text' | 'number' | 'date' | 'url';
  onCommit: (next: string) => void;
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  return (
    <input
      type={type}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== initial) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(initial);
      }}
      className={`flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm ${
        fullWidth ? '' : 'max-w-xs'
      }`}
    />
  );
}

export function CustomFieldsSection({
  workspaceId,
  entityType,
  value,
  onSubmit,
  showEmptyInReadonly = false,
  disabled = false,
  layout = 'row',
}: Props) {
  const t = useTranslations('customFields');

  const { data, isLoading } = useQuery({
    queryKey: ['custom-fields', workspaceId, entityType],
    queryFn: () => customFieldApi.list(workspaceId!, entityType).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const defs = data?.items ?? [];
  const current = value ?? {};
  const editable = !!onSubmit && !disabled;

  const commit = (key: string, next: unknown) => {
    if (!onSubmit) return;
    // 显式传 null 表示清空：服务端按字段级合并写入，缺省该 key 会被保留
    const nextValue = isEmptyValue(next) && typeof next !== 'boolean' ? null : next;
    onSubmit({ ...current, [key]: nextValue });
  };

  if (isLoading || defs.length === 0) return null;

  const visible = editable
    ? defs
    : defs.filter((d) => showEmptyInReadonly || !isEmptyValue(current[d.key]));

  if (visible.length === 0) return null;

  const stacked = layout === 'stack';

  return (
    <>
      {visible.map((def) => {
        const raw = current[def.key];

        return (
          <div
            key={def.id}
            className={stacked ? 'space-y-1' : 'flex items-start gap-3 py-3'}
          >
            <span
              className={
                stacked
                  ? 'block text-xs text-muted-foreground'
                  : 'w-20 shrink-0 break-words text-sm text-muted-foreground'
              }
            >
              {def.label}
              {def.isRequired && <span className="ml-0.5 text-destructive">*</span>}
            </span>

            <div className={stacked ? '' : 'flex-1 min-w-0'}>
              {!editable ? (
                <span className={`text-sm ${isEmptyValue(raw) ? 'text-muted-foreground' : ''}`}>
                  {formatValue(def, raw) || t('emptyValue')}
                </span>
              ) : (
                <>
                  {(def.type === 'TEXT' || def.type === 'URL') && (
                    <DraftTextInput
                      initial={typeof raw === 'string' ? raw : ''}
                      type={def.type === 'URL' ? 'url' : 'text'}
                      fullWidth={stacked}
                      onCommit={(v) => commit(def.key, v)}
                    />
                  )}

                  {def.type === 'NUMBER' && (
                    <DraftTextInput
                      initial={typeof raw === 'number' ? String(raw) : ''}
                      type="number"
                      fullWidth={stacked}
                      onCommit={(v) => {
                        if (v.trim() === '') return commit(def.key, null);
                        const num = Number(v);
                        if (Number.isFinite(num)) commit(def.key, num);
                      }}
                    />
                  )}

                  {def.type === 'DATE' && (
                    <DraftTextInput
                      initial={typeof raw === 'string' ? raw.slice(0, 10) : ''}
                      type="date"
                      fullWidth={stacked}
                      onCommit={(v) => commit(def.key, v || null)}
                    />
                  )}

                  {def.type === 'SELECT' && (
                    <select
                      className={`flex h-8 rounded-md border border-input bg-transparent px-2 text-sm ${
                        stacked ? 'w-full' : ''
                      }`}
                      value={typeof raw === 'string' ? raw : ''}
                      onChange={(e) => commit(def.key, e.target.value || null)}
                    >
                      <option value="">{t('emptyValue')}</option>
                      {(def.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {def.type === 'MULTI_SELECT' && (
                    <div className="flex flex-wrap gap-1.5">
                      {(def.options ?? []).map((opt) => {
                        const picked = Array.isArray(raw) && raw.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              const list = Array.isArray(raw) ? raw.filter((x) => x !== opt.value) : [];
                              commit(def.key, picked ? list : [...list, opt.value]);
                            }}
                            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                              picked
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-input text-muted-foreground hover:bg-accent'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {def.type === 'CHECKBOX' && (
                    <input
                      type="checkbox"
                      checked={raw === true}
                      onChange={(e) => commit(def.key, e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                  )}

                  {def.description && (
                    <p className="mt-1 text-xs text-muted-foreground">{def.description}</p>
                  )}
                  {def.type === 'DATE' && <p className="mt-1 text-xs text-muted-foreground">{t('dateHint')}</p>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
