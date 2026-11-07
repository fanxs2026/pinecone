'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  customFieldApi,
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
  type CustomFieldDef,
  type CustomFieldEntityType,
  type CustomFieldInput,
  type CustomFieldOption,
  type CustomFieldType,
} from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { showToast } from '@/components/simple-toast';
import { ArrowDown, ArrowUp, ListPlus, Pencil, Trash2 } from 'lucide-react';

const TYPE_LABEL_KEYS: Record<CustomFieldType, string> = {
  TEXT: 'typeText',
  NUMBER: 'typeNumber',
  SELECT: 'typeSelect',
  MULTI_SELECT: 'typeMultiSelect',
  DATE: 'typeDate',
  CHECKBOX: 'typeCheckbox',
  URL: 'typeUrl',
};

const ENTITY_LABEL_KEYS: Record<CustomFieldEntityType, string> = {
  IDEA: 'entityIdea',
  FEATURE: 'entityFeature',
  STORY: 'entityStory',
  SUPPORT: 'entitySupport',
};

interface FormState {
  label: string;
  key: string;
  type: CustomFieldType;
  isRequired: boolean;
  options: CustomFieldOption[];
}

function emptyForm(): FormState {
  return { label: '', key: '', type: 'TEXT', isRequired: false, options: [] };
}

function formFromDef(def: CustomFieldDef): FormState {
  return {
    label: def.label,
    key: def.key,
    type: def.type,
    isRequired: def.isRequired,
    options: def.options ?? [],
  };
}

/**
 * 自定义属性配置面板。
 *
 * 配额只统计启用中的字段：归档即释放额度，界面在达到上限时禁用新建，
 * 不让用户填完表单才撞到后端 400。
 */
export function CustomFieldConfigPanel({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations('customFields');
  const queryClient = useQueryClient();

  const [entityType, setEntityType] = useState<CustomFieldEntityType>('STORY');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const queryKey = ['custom-fields-config', workspaceId, entityType];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => customFieldApi.list(workspaceId!, entityType, true).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const items = data?.items ?? [];
  const quota = data?.quota;
  const quotaFull = !!quota && quota.used >= quota.limit;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    // 详情页用的键不含 includeInactive，一并刷新
    queryClient.invalidateQueries({ queryKey: ['custom-fields', workspaceId, entityType] });
  };

  const onError = (e: unknown) => {
    const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
    showToast(Array.isArray(msg) ? String(msg[0]) : typeof msg === 'string' ? msg : t('error'));
  };

  const createField = useMutation({
    mutationFn: (payload: CustomFieldInput) =>
      customFieldApi.create(workspaceId!, payload).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setForm(emptyForm());
      showToast(t('created'));
    },
    onError,
  });

  const updateField = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CustomFieldInput> }) =>
      customFieldApi.update(workspaceId!, id, payload).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setForm(emptyForm());
      showToast(t('savedMsg'));
    },
    onError,
  });

  const removeField = useMutation({
    mutationFn: (id: string) => customFieldApi.remove(workspaceId!, id),
    onSuccess: () => {
      invalidate();
      showToast(t('deletedMsg'));
    },
    onError,
  });

  const reorder = useMutation({
    mutationFn: (payload: { id: string; sortOrder: number }[]) =>
      customFieldApi.reorder(workspaceId!, payload),
    onSuccess: () => invalidate(),
    onError,
  });

  const submit = () => {
    if (!form.label.trim() || !form.key.trim()) return;
    const needsOptions = form.type === 'SELECT' || form.type === 'MULTI_SELECT';
    const payload: CustomFieldInput = {
      entityType,
      key: form.key.trim(),
      label: form.label.trim(),
      type: form.type,
      isRequired: form.isRequired,
      options: needsOptions ? form.options.filter((o) => o.value.trim()) : undefined,
    };

    if (editingId) {
      // key 与 entityType 不可修改，类型变更由后端按同族规则判定
      updateField.mutate({
        id: editingId,
        payload: {
          label: payload.label,
          type: payload.type,
          isRequired: payload.isRequired,
          options: payload.options,
        },
      });
    } else {
      createField.mutate(payload);
    }
  };

  const startEdit = (def: CustomFieldDef) => {
    setEditingId(def.id);
    setForm(formFromDef(def));
    setShowForm(false);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    reorder.mutate(next.map((item, i) => ({ id: item.id, sortOrder: i })));
  };

  const needsOptions = form.type === 'SELECT' || form.type === 'MULTI_SELECT';

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ListPlus className="h-4 w-4 text-muted-foreground" />
              {t('title')}
            </span>
            {quota && (
              <span
                className={`text-xs font-normal ${quotaFull ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {quotaFull ? t('quotaFull', { limit: quota.limit }) : t('quota', { used: quota.used, limit: quota.limit })}
              </span>
            )}
          </CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_FIELD_ENTITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setEntityType(type);
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm());
                }}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  entityType === type
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:bg-accent'
                }`}
              >
                {t(ENTITY_LABEL_KEYS[type])}
              </button>
            ))}
          </div>

          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noFields')}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((def, index) => (
                <li
                  key={def.id}
                  className="flex items-center gap-2 rounded-md border border-input px-2.5 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{def.label}</span>
                      <code className="shrink-0 text-xs text-muted-foreground">{def.key}</code>
                      {def.isRequired && <span className="text-xs text-destructive">*</span>}
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {t(TYPE_LABEL_KEYS[def.type])}
                      </Badge>
                      {!def.isActive && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {t('archived')}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t('moveUp')}
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={t('moveDown')}
                      disabled={index === items.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={def.isActive ? t('archive') : t('enable')}
                      disabled={updateField.isPending || (quotaFull && !def.isActive)}
                      onClick={() => updateField.mutate({ id: def.id, payload: { isActive: !def.isActive } })}
                    >
                      <span className="text-[11px]">{def.isActive ? t('archive') : t('enable')}</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(def)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(t('deleteConfirm'))) removeField.mutate(def.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!showForm && !editingId && (
            <Button
              size="sm"
              variant="outline"
              disabled={quotaFull}
              title={quotaFull && quota ? t('quotaFull', { limit: quota.limit }) : undefined}
              onClick={() => {
                setForm(emptyForm());
                setShowForm(true);
              }}
            >
              <ListPlus className="mr-1 h-3.5 w-3.5" />
              {t('addField')}
            </Button>
          )}

          {(showForm || editingId) && (
            <div className="space-y-3 rounded-md border border-input p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t('fieldLabel')}</span>
                  <Input
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    maxLength={60}
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t('fieldKey')}</span>
                  <Input
                    value={form.key}
                    disabled={!!editingId}
                    onChange={(e) => setForm({ ...form, key: e.target.value.replace(/[^a-z0-9_]/g, '').toLowerCase() })}
                    placeholder="affect_version"
                    maxLength={40}
                  />
                  {!editingId && <span className="text-[11px] text-muted-foreground">{t('fieldKeyHint')}</span>}
                </label>

                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">{t('fieldType')}</span>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as CustomFieldType })}
                  >
                    {CUSTOM_FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(TYPE_LABEL_KEYS[type])}
                      </option>
                    ))}
                  </select>
                  {editingId && <span className="text-[11px] text-muted-foreground">{t('typeChangeHint')}</span>}
                </label>

                <label className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={form.isRequired}
                    onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="text-sm">{t('required')}</span>
                </label>
              </div>

              {needsOptions && (
                <div className="space-y-2">
                  <span className="text-xs text-muted-foreground">{t('fieldOptions')}</span>
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={opt.value}
                        placeholder={t('optionValue')}
                        onChange={(e) => {
                          const next = [...form.options];
                          next[i] = { ...next[i], value: e.target.value };
                          setForm({ ...form, options: next });
                        }}
                        className="w-40"
                      />
                      <Input
                        value={opt.label}
                        placeholder={t('optionLabel')}
                        onChange={(e) => {
                          const next = [...form.options];
                          next[i] = { ...next[i], label: e.target.value };
                          setForm({ ...form, options: next });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({ ...form, options: [...form.options, { value: '', label: '' }] })
                    }
                  >
                    {t('addOption')}
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={submit}
                  disabled={
                    !form.label.trim() ||
                    !form.key.trim() ||
                    createField.isPending ||
                    updateField.isPending
                  }
                >
                  {t('save')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setForm(emptyForm());
                  }}
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
