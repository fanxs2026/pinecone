'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationApi, type AutomationRule } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Zap, Plus, Trash2, Loader2 } from 'lucide-react';
import { showToast } from '@/components/simple-toast';

const ENTITIES = ['ALL', 'STORY', 'IDEA', 'FEATURE', 'SUPPORT'] as const;
const TRIGGERS = ['CREATED', 'STATUS_CHANGED', 'ASSIGNED'] as const;

const ENTITY_LABEL: Record<string, string> = { ALL: '全部实体', STORY: '任务', IDEA: '需求', FEATURE: '功能', SUPPORT: '支持' };
const TRIGGER_LABEL: Record<string, string> = { CREATED: '创建时', STATUS_CHANGED: '状态变更为', ASSIGNED: '被指派时' };

export function AutomationConfigPanel({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations('automationConfig');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    entityType: 'SUPPORT',
    trigger: 'CREATED' as string,
    triggerValue: '',
    actionType: 'NOTIFY' as string,
    target: 'ALL_MEMBERS',
    message: '',
    status: '',
  });

  const { data: rules, isLoading } = useQuery({
    queryKey: ['automation-rules', workspaceId],
    queryFn: () => automationApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['automation-rules', workspaceId] });

  const createRule = useMutation({
    mutationFn: () =>
      automationApi
        .create(workspaceId!, {
          name: form.name,
          entityType: form.entityType,
          trigger: form.trigger as AutomationRule['trigger'],
          triggerValue: form.trigger === 'STATUS_CHANGED' ? form.triggerValue : undefined,
          actions: [
            form.actionType === 'NOTIFY'
              ? { type: 'NOTIFY', target: form.target, message: form.message || t('defaultMsg') }
              : { type: 'SET_STATUS', status: form.status },
          ],
        })
        .then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setForm({ name: '', entityType: 'SUPPORT', trigger: 'CREATED', triggerValue: '', actionType: 'NOTIFY', target: 'ALL_MEMBERS', message: '', status: '' });
      showToast(t('created'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      automationApi.update(workspaceId!, id, { enabled }).then((r) => r.data),
    onSuccess: () => invalidate(),
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeRule = useMutation({
    mutationFn: (id: string) => automationApi.remove(workspaceId!, id),
    onSuccess: () => { invalidate(); showToast(t('removed')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              {t('title')}
            </span>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setShowForm((v) => !v)}>
              {showForm ? t('cancel') : (<><Plus className="mr-1 h-3.5 w-3.5" />{t('newRule')}</>)}
            </Button>
          </CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {showForm && (
            <div className="space-y-3 rounded-md border p-3">
              <Input
                value={form.name}
                placeholder={t('namePh')}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t('entity')}</div>
                  <select
                    value={form.entityType}
                    onChange={(e) => setForm((p) => ({ ...p, entityType: e.target.value }))}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    {ENTITIES.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e]}</option>)}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t('trigger')}</div>
                  <select
                    value={form.trigger}
                    onChange={(e) => setForm((p) => ({ ...p, trigger: e.target.value }))}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    {TRIGGERS.map((tr) => <option key={tr} value={tr}>{TRIGGER_LABEL[tr]}</option>)}
                  </select>
                </div>
              </div>
              {form.trigger === 'STATUS_CHANGED' && (
                <Input
                  value={form.triggerValue}
                  placeholder={t('statusPh')}
                  onChange={(e) => setForm((p) => ({ ...p, triggerValue: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
                  className="h-8 font-mono text-sm"
                />
              )}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t('action')}</div>
                  <select
                    value={form.actionType}
                    onChange={(e) => setForm((p) => ({ ...p, actionType: e.target.value }))}
                    className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="NOTIFY">{t('actionNotify')}</option>
                    <option value="SET_STATUS">{t('actionSetStatus')}</option>
                  </select>
                </div>
                {form.actionType === 'NOTIFY' ? (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">{t('notifyTarget')}</div>
                    <select
                      value={form.target}
                      onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="ALL_MEMBERS">{t('targetAll')}</option>
                      <option value="ASSIGNEE">{t('targetAssignee')}</option>
                      <option value="CREATOR">{t('targetCreator')}</option>
                      <option value="ROLE:ADMIN">{t('targetAdmin')}</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">{t('setStatusTo')}</div>
                    <Input
                      value={form.status}
                      placeholder="DONE"
                      onChange={(e) => setForm((p) => ({ ...p, status: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))}
                      className="h-8 font-mono text-sm"
                    />
                  </div>
                )}
              </div>
              {form.actionType === 'NOTIFY' && (
                <Input
                  value={form.message}
                  placeholder={t('msgPh')}
                  onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                  className="h-8 text-sm"
                />
              )}
              <div className="flex justify-end">
                <Button size="sm" disabled={!form.name || createRule.isPending} onClick={() => createRule.mutate()}>
                  {createRule.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {t('create')}
                </Button>
              </div>
            </div>
          )}

          {(!rules || rules.length === 0) && !showForm ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            rules?.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <Badge variant="outline" className="text-[10px]">{ENTITY_LABEL[r.entityType] ?? r.entityType}</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {TRIGGER_LABEL[r.trigger] ?? r.trigger}{r.trigger === 'STATUS_CHANGED' && r.triggerValue ? ` ${r.triggerValue}` : ''}
                    </Badge>
                    <Badge className={r.enabled ? 'bg-green-50 text-green-700' : ''} variant={r.enabled ? 'outline' : 'secondary'}>
                      {r.enabled ? t('on') : t('off')}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.actions.map((a) => (a.type === 'NOTIFY' ? `${t('actionNotify')} → ${a.target}${a.message ? `：${a.message}` : ''}` : `${t('actionSetStatus')} → ${a.status}`)).join('；')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => toggle.mutate({ id: r.id, enabled: !r.enabled })}
                  >
                    {r.enabled ? t('disable') : t('enable')}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRule.mutate(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
