'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  customFieldApi,
  savedViewApi,
  type CustomFieldEntityType,
  type ListFilters,
  type SavedView,
} from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/simple-toast';
import { Filter, Columns3, Save, Trash2 } from 'lucide-react';

/**
 * 列表工具栏：筛选 + 保存视图 + 列配置。
 *
 * 筛选走服务端（`cf` 参数），因此结果覆盖全部数据而不是当前这一页——
 * 这也是为什么状态/优先级这类原有前端过滤要一并迁过来，两套过滤并存会出现
 * 「筛了但没筛全」的错觉。
 */
interface Props {
  workspaceId: string | null;
  entityType: CustomFieldEntityType;
  filters: ListFilters;
  onFiltersChange: (next: ListFilters) => void;
  statusOptions: { value: string; label: string }[];
  priorityOptions?: { value: string; label: string }[];
  memberOptions?: { value: string; label: string }[];
  /** 提供时显示列配置入口 */
  columnOptions?: { key: string; label: string }[];
  columns?: string[];
  onColumnsChange?: (next: string[]) => void;
}

function toggleValue(list: string[] | undefined, value: string): string[] {
  const current = list ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return next;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
        active
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-input text-muted-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
}

export function ListViewToolbar({
  workspaceId,
  entityType,
  filters,
  onFiltersChange,
  statusOptions,
  priorityOptions,
  memberOptions,
  columnOptions,
  columns,
  onColumnsChange,
}: Props) {
  const t = useTranslations('listView');
  const c = useTranslations('customFields');
  const queryClient = useQueryClient();

  const [panel, setPanel] = useState<'none' | 'filters' | 'columns'>('none');
  const [saving, setSaving] = useState(false);
  const [viewName, setViewName] = useState('');
  const [viewShared, setViewShared] = useState(false);
  const [activeViewId, setActiveViewId] = useState('');

  const { data: fieldData } = useQuery({
    queryKey: ['custom-fields', workspaceId, entityType],
    queryFn: () => customFieldApi.list(workspaceId!, entityType).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

  const { data: views = [] } = useQuery({
    queryKey: ['saved-views', workspaceId, entityType],
    queryFn: () => savedViewApi.list(workspaceId!, entityType).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 只有单选类型适合做多选筛选：取值来自固定选项集合
  const selectFields = useMemo(
    () => (fieldData?.items ?? []).filter((f) => f.type === 'SELECT' && (f.options?.length ?? 0) > 0),
    [fieldData],
  );

  const activeFilterCount =
    (filters.status?.length ?? 0) +
    (filters.priority?.length ?? 0) +
    (filters.assigneeId?.length ?? 0) +
    Object.values(filters.customFields ?? {}).reduce((sum, v) => sum + v.length, 0);

  const invalidateViews = () =>
    queryClient.invalidateQueries({ queryKey: ['saved-views', workspaceId, entityType] });

  const onError = (e: unknown) => {
    const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
    showToast(Array.isArray(msg) ? String(msg[0]) : typeof msg === 'string' ? msg : t('error'));
  };

  const createView = useMutation({
    mutationFn: () =>
      savedViewApi
        .create(workspaceId!, {
          entityType,
          name: viewName.trim(),
          filters,
          columns: columns && columns.length > 0 ? columns : undefined,
          isShared: viewShared,
        })
        .then((r) => r.data),
    onSuccess: (view) => {
      invalidateViews();
      setSaving(false);
      setViewName('');
      setViewShared(false);
      setActiveViewId(view.id);
      showToast(t('saved'));
    },
    onError,
  });

  const updateView = useMutation({
    mutationFn: () =>
      savedViewApi.update(workspaceId!, activeViewId, { filters, columns }).then((r) => r.data),
    onSuccess: () => {
      invalidateViews();
      showToast(t('saved'));
    },
    onError,
  });

  const removeView = useMutation({
    mutationFn: () => savedViewApi.remove(workspaceId!, activeViewId),
    onSuccess: () => {
      invalidateViews();
      setActiveViewId('');
      showToast(t('removed'));
    },
    onError,
  });

  const applyView = (view: SavedView | null) => {
    if (!view) {
      setActiveViewId('');
      onFiltersChange({});
      return;
    }
    setActiveViewId(view.id);
    onFiltersChange(view.filters ?? {});
    if (view.columns && view.columns.length > 0 && onColumnsChange) {
      onColumnsChange(view.columns);
    }
  };

  const currentView = views.find((v) => v.id === activeViewId) ?? null;

  const setCustomField = (key: string, values: string[]) => {
    const nextCf = { ...(filters.customFields ?? {}) };
    if (values.length === 0) delete nextCf[key];
    else nextCf[key] = values;
    onFiltersChange({ ...filters, customFields: nextCf });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* 视图切换 */}
        <select
          className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={activeViewId}
          onChange={(e) => {
            const view = views.find((v) => v.id === e.target.value) ?? null;
            applyView(view);
          }}
        >
          <option value="">{t('defaultView')}</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.isShared && !v.isMine ? ` · ${v.createdBy?.name || v.createdBy?.email || ''}` : ''}
            </option>
          ))}
        </select>

        <Button
          size="sm"
          variant={panel === 'filters' ? 'default' : 'outline'}
          onClick={() => setPanel(panel === 'filters' ? 'none' : 'filters')}
        >
          <Filter className="mr-1 h-3.5 w-3.5" />
          {t('filters')}
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded bg-primary-foreground/20 px-1 text-[10px]">{activeFilterCount}</span>
          )}
        </Button>

        {columnOptions && onColumnsChange && (
          <Button
            size="sm"
            variant={panel === 'columns' ? 'default' : 'outline'}
            onClick={() => setPanel(panel === 'columns' ? 'none' : 'columns')}
          >
            <Columns3 className="mr-1 h-3.5 w-3.5" />
            {t('columns')}
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={() => setSaving(true)}>
          <Save className="mr-1 h-3.5 w-3.5" />
          {t('saveAs')}
        </Button>

        {currentView?.isMine && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateView.mutate()}
              disabled={updateView.isPending}
            >
              {t('update')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (window.confirm(t('deleteConfirm'))) removeView.mutate();
              }}
              disabled={removeView.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </>
        )}

        {activeFilterCount > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onFiltersChange({})}>
            {t('clear')}
          </Button>
        )}
      </div>

      {saving && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input p-2">
          <Input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder={t('namePlaceholder')}
            maxLength={60}
            className="h-8 w-56"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={viewShared}
              onChange={(e) => setViewShared(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input"
            />
            {t('share')}
          </label>
          <Button
            size="sm"
            onClick={() => createView.mutate()}
            disabled={!viewName.trim() || createView.isPending}
          >
            {t('save')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSaving(false);
              setViewName('');
            }}
          >
            {t('cancel')}
          </Button>
        </div>
      )}

      {panel === 'filters' && (
        <div className="space-y-2 rounded-md border border-input p-3">
          <FilterRow label={t('status')}>
            {statusOptions.map((opt) => (
              <Chip
                key={opt.value}
                active={(filters.status ?? []).includes(opt.value)}
                onClick={() =>
                  onFiltersChange({ ...filters, status: toggleValue(filters.status, opt.value) })
                }
              >
                {opt.label}
              </Chip>
            ))}
          </FilterRow>

          {priorityOptions && priorityOptions.length > 0 && (
            <FilterRow label={t('priority')}>
              {priorityOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  active={(filters.priority ?? []).includes(opt.value)}
                  onClick={() =>
                    onFiltersChange({ ...filters, priority: toggleValue(filters.priority, opt.value) })
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </FilterRow>
          )}

          {memberOptions && memberOptions.length > 0 && (
            <FilterRow label={t('assignee')}>
              <Chip
                active={(filters.assigneeId ?? []).includes('unassigned')}
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    assigneeId: toggleValue(filters.assigneeId, 'unassigned'),
                  })
                }
              >
                {t('unassigned')}
              </Chip>
              {memberOptions.map((opt) => (
                <Chip
                  key={opt.value}
                  active={(filters.assigneeId ?? []).includes(opt.value)}
                  onClick={() =>
                    onFiltersChange({
                      ...filters,
                      assigneeId: toggleValue(filters.assigneeId, opt.value),
                    })
                  }
                >
                  {opt.label}
                </Chip>
              ))}
            </FilterRow>
          )}

          {selectFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('noCustomFields')}</p>
          ) : (
            selectFields.map((field) => (
              <FilterRow key={field.id} label={field.label}>
                {(field.options ?? []).map((opt) => (
                  <Chip
                    key={opt.value}
                    active={(filters.customFields?.[field.key] ?? []).includes(opt.value)}
                    onClick={() =>
                      setCustomField(
                        field.key,
                        toggleValue(filters.customFields?.[field.key], opt.value),
                      )
                    }
                  >
                    {opt.label}
                  </Chip>
                ))}
                <span className="ml-1 text-[10px] text-muted-foreground">{c('moreAttributes')}</span>
              </FilterRow>
            ))
          )}
        </div>
      )}

      {panel === 'columns' && columnOptions && columns && onColumnsChange && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input p-3">
          {columnOptions.map((opt) => (
            <Chip
              key={opt.key}
              active={columns.includes(opt.key)}
              onClick={() => {
                const next = columns.includes(opt.key)
                  ? columns.filter((k) => k !== opt.key)
                  : [...columns, opt.key];
                onColumnsChange(next);
              }}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}


