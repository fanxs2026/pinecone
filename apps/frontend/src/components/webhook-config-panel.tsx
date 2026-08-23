'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { webhookApi, workspaceApi, type WebhookEndpoint } from '@/lib/api-client';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAuthStore } from '@/stores/auth-store';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Webhook, Plus, Pencil, Trash2, Loader2, Send } from 'lucide-react';

const emptyForm = { name: '', url: '', events: '*', secret: '', format: 'JSON' };

/** 设置页「Webhook」页签：事件端点管理（CRUD 需 ADMIN） */
export function WebhookConfigPanel() {
  const t = useTranslations('webhookConfig');
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const currentUser = useAuthStore((s) => s.user);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WebhookEndpoint | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const isAdmin = members.some((m) => m.userId === currentUser?.id && m.role === 'ADMIN');

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks', workspaceId],
    queryFn: () => webhookApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] });

  const createMutation = useMutation({
    mutationFn: () =>
      webhookApi.create(workspaceId!, {
        name: form.name.trim(),
        url: form.url.trim(),
        events: form.events.split(',').map((e) => e.trim()).filter(Boolean),
        format: form.format,
        secret: form.secret || undefined,
      }).then((r) => r.data),
    onSuccess: (d) => {
      invalidate(); setShowForm(false); setForm(emptyForm);
      setRevealedSecret(d.secret ?? null);
      showToast(t('created'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      webhookApi.update(workspaceId!, id, {
        name: form.name.trim(),
        url: form.url.trim(),
        events: form.events.split(',').map((e) => e.trim()).filter(Boolean),
        format: form.format,
      }).then((r) => r.data),
    onSuccess: () => { invalidate(); setShowForm(false); setEditing(null); setForm(emptyForm); showToast(t('updated')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => webhookApi.remove(workspaceId!, id),
    onSuccess: () => { invalidate(); showToast(t('removed')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const deliverMutation = useMutation({
    mutationFn: () => webhookApi.deliverPending(workspaceId!),
    onSuccess: () => { invalidate(); showToast(t('delivered')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const startEdit = (w: WebhookEndpoint) => {
    setEditing(w);
    setForm({ name: w.name, url: w.url, events: (w.events ?? ['*']).join(', '), secret: '', format: w.format ?? 'JSON' });
    setShowForm(true);
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-muted-foreground">{t('adminOnly')}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="h-4 w-4 text-muted-foreground" />{t('title')}
          </CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7" disabled={deliverMutation.isPending} onClick={() => deliverMutation.mutate()}>
            {deliverMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
            {t('deliverPending')}
          </Button>
          {!showForm && (
            <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true); }}>
              <Plus className="mr-1 h-4 w-4" />{t('newEndpoint')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('fName')}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="CI 构建通知" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>{t('fUrl')}</Label>
                <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/hooks/pinecone" />
              </div>
              <div className="space-y-1">
                <Label>{t('fEvents')}</Label>
                <Input value={form.events} onChange={(e) => setForm({ ...form, events: e.target.value })} placeholder="* 或 SUPPORT.CREATED, STORY.UPDATED" />
              </div>
              <div className="space-y-1">
                <Label>{t('fFormat')}</Label>
                <select
                  value={form.format}
                  onChange={(e) => setForm({ ...form, format: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="JSON">JSON（通用）</option>
                  <option value="SLACK">Slack（Incoming Webhook 模板）</option>
                  <option value="WECOM">企业微信（机器人 markdown）</option>
                  <option value="DINGTALK">钉钉（机器人 markdown）</option>
                  <option value="FEISHU">飞书（机器人 interactive 卡片）</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>{editing ? t('fSecretEdit') : t('fSecret')}</Label>
                <Input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder={editing ? t('fSecretPh') : ''} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!form.name.trim() || !form.url.trim() || createMutation.isPending || updateMutation.isPending}
                onClick={() => (editing ? updateMutation.mutate(editing.id) : createMutation.mutate())}>
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {editing ? t('save') : t('create')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditing(null); setForm(emptyForm); }}>{t('cancel')}</Button>
            </div>
            {revealedSecret && !editing && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <b>{t('secretOnce')}</b> <code className="break-all">{revealedSecret}</code>
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : webhooks.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          webhooks.map((w) => (
            <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <Badge variant="outline" className={w.active === false ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}>{w.active === false ? t('inactive') : t('active')}</Badge>
                  {w.lastStatus && (
                    <Badge variant="outline" className={w.lastStatus === 'DELIVERED' ? 'bg-green-50 text-green-700' : w.lastStatus === 'FAILED' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500'}>{w.lastStatus}</Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {w.url} · {(w.events ?? []).join(', ') || '*'} · {w.format ?? 'JSON'}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(w)} title={t('edit')}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => { if (confirm(t('confirmDelete'))) removeMutation.mutate(w.id); }} title={t('delete')}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
