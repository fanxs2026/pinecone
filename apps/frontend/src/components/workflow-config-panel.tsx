'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowApi, type Workflow, type StoryStatus } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { Workflow as WorkflowIcon, Plus, Trash2, Save, Loader2, Settings2 } from 'lucide-react';
import { showToast } from '@/components/simple-toast';
import { cn } from '@/lib/utils';

const ENTITY_TYPES = ['STORY', 'IDEA', 'FEATURE', 'SUPPORT'] as const;
const ENTITY_LABEL_KEY: Record<string, string> = { STORY: 'story', IDEA: 'idea', FEATURE: 'feature', SUPPORT: 'support' };
const ENTITY_DEFAULT_NAME: Record<string, string> = { STORY: 'Story 工作流', IDEA: 'Idea 工作流', FEATURE: 'Feature 工作流', SUPPORT: 'Support 工作流' };

export function WorkflowConfigPanel({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations('workflowConfig');
  const queryClient = useQueryClient();
  const [newStatus, setNewStatus] = useState<Record<string, { name: string; color: string }>>({});
  const [newTrans, setNewTrans] = useState<Record<string, { from: string; to: string }>>({});

  const { data: workflows, isLoading } = useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: () => workflowApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const byEntity = useMemo(() => {
    const m = new Map<string, Workflow>();
    // 后端返回分页对象 {items, total}，兼容裸数组
    const items = Array.isArray(workflows) ? workflows : ((workflows as { items?: Workflow[] } | undefined)?.items ?? []);
    items.forEach((w) => m.set(w.entityType, w));
    return m;
  }, [workflows]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workflows', workspaceId] });

  const createWorkflow = useMutation({
    mutationFn: (entityType: string) =>
      workflowApi.create(workspaceId!, { name: ENTITY_DEFAULT_NAME[entityType], entityType }).then((r) => r.data),
    onSuccess: () => { invalidate(); showToast(t('saved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const saveStatus = useMutation({
    mutationFn: ({ wfId, data }: { wfId: string; data: { name: string; color?: string } }) =>
      workflowApi.addStatus(workspaceId!, wfId, data),
    onSuccess: () => { invalidate(); showToast(t('saved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const renameStatus = useMutation({
    mutationFn: ({ statusId, name, color, wipLimit }: { statusId: string; name?: string; color?: string; wipLimit?: number | null }) =>
      workflowApi.updateStatus(workspaceId!, statusId, { name, color, wipLimit }),
    onSuccess: () => { invalidate(); showToast(t('saved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeStatus = useMutation({
    mutationFn: (statusId: string) => workflowApi.removeStatus(workspaceId!, statusId),
    onSuccess: () => { invalidate(); showToast(t('saved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const addTransition = useMutation({
    mutationFn: (data: { fromStatusId: string; toStatusId: string }) =>
      workflowApi.addTransition(workspaceId!, data),
    onSuccess: () => { invalidate(); showToast(t('saved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeTransition = useMutation({
    mutationFn: (id: string) => workflowApi.removeTransition(workspaceId!, id),
    onSuccess: () => { invalidate(); showToast(t('saved')); },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <WorkflowIcon className="h-4 w-4 text-muted-foreground" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {ENTITY_TYPES.map((et) => {
            const wf = byEntity.get(et);
            const pendingName = newStatus[et]?.name ?? '';
            const pendingColor = newStatus[et]?.color ?? '#94a3b8';
            const pendingTrans = newTrans[et];

            return (
              <div key={et} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-accent/50">{t(ENTITY_LABEL_KEY[et])}</Badge>
                    {wf ? (
                      <Badge className="bg-blue-50 text-blue-700">{t('custom')}</Badge>
                    ) : (
                      <Badge variant="outline">{t('default')}</Badge>
                    )}
                  </div>
                  {!wf && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      disabled={createWorkflow.isPending}
                      onClick={() => createWorkflow.mutate(et)}
                    >
                      {createWorkflow.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Settings2 className="mr-1 h-3.5 w-3.5" />}
                      {t('startCustom')}
                    </Button>
                  )}
                </div>

                {!wf ? (
                  <p className="text-xs text-muted-foreground/70">{t('usingDefault')}</p>
                ) : (
                  <>
                    {/* 状态列表 */}
                    <div className="mb-2 text-xs font-medium text-muted-foreground">{t('statesLabel')}</div>
                    <div className="space-y-1.5">
                      {wf.statuses.map((st: StoryStatus) => (
                        <div key={st.id} className="flex items-center gap-2">
                          <input
                            type="color"
                            value={st.color || '#94a3b8'}
                            onChange={(e) => renameStatus.mutate({ statusId: st.id, color: e.target.value })}
                            className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent"
                            title={t('color')}
                          />
                          <Input
                            value={st.name}
                            onChange={(e) => {
                              // 失焦保存改名（避免每次按键请求）
                              (e.target as HTMLInputElement).dataset.pending = e.target.value;
                            }}
                            onBlur={(e) => {
                              const v = (e.target as HTMLInputElement).dataset.pending;
                              if (v && v !== st.name) renameStatus.mutate({ statusId: st.id, name: v.toUpperCase().replace(/[^A-Z0-9_]/g, '') });
                            }}
                            className="h-7 w-44 font-mono text-xs"
                          />
                          <Badge variant="outline" className="text-[10px]">{st.type}</Badge>
                          <Input
                            type="number"
                            min={1}
                            placeholder={t('wipLimitPlaceholder')}
                            defaultValue={st.wipLimit ?? ''}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              const next = v === '' ? null : Number(v);
                              const cur = st.wipLimit ?? null;
                              if ((next === null && cur !== null) || (next !== null && next !== cur)) {
                                renameStatus.mutate({ statusId: st.id, wipLimit: next } as any);
                              }
                            }}
                            className="h-7 w-14 text-center text-xs"
                            title={t('wipLimit')}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStatus.mutate(st.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      {/* 新增状态行 */}
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={pendingColor}
                          onChange={(e) => setNewStatus((p) => ({ ...p, [et]: { name: pendingName, color: e.target.value } }))}
                          className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent"
                        />
                        <Input
                          value={pendingName}
                          placeholder="NEW_STATUS"
                          onChange={(e) => setNewStatus((p) => ({ ...p, [et]: { name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''), color: pendingColor } }))}
                          className="h-7 w-44 font-mono text-xs"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={!pendingName || saveStatus.isPending}
                          onClick={() => {
                            saveStatus.mutate({ wfId: wf.id, data: { name: pendingName, color: pendingColor } });
                            setNewStatus((p) => ({ ...p, [et]: { name: '', color: '#94a3b8' } }));
                          }}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          {t('addState')}
                        </Button>
                      </div>
                    </div>

                    {/* 转换规则 */}
                    <div className="mb-2 mt-3 text-xs font-medium text-muted-foreground">
                      {t('transitionsLabel')}
                      <span className="ml-1 font-normal text-muted-foreground/60">{t('transitionsHint')}</span>
                    </div>
                    {wf.statuses.flatMap((s) => s.transitionsFrom ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">{t('noLimit')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {wf.statuses.flatMap((s) =>
                          (s.transitionsFrom ?? []).map((tr) => {
                            const fromName = s.name;
                            const toId = tr.toStatusId;
                            const toSt = wf.statuses.find((x) => x.id === toId);
                            return (
                              <div key={tr.id} className="flex items-center gap-2 text-xs">
                                <span className="rounded border border-input px-2 py-1 font-mono">{fromName}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="rounded border border-input px-2 py-1 font-mono">{toSt?.name ?? toId.slice(0, 8)}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeTransition.mutate(tr.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    )}
                    {/* 新增转换行 */}
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <select
                        value={pendingTrans?.from ?? ''}
                        onChange={(e) => setNewTrans((p) => ({ ...p, [et]: { from: e.target.value, to: pendingTrans?.to ?? '' } }))}
                        className="h-7 rounded-md border border-input bg-transparent px-2"
                      >
                        <option value="">{t('from')}</option>
                        {wf.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <span className="text-muted-foreground">→</span>
                      <select
                        value={pendingTrans?.to ?? ''}
                        onChange={(e) => setNewTrans((p) => ({ ...p, [et]: { from: pendingTrans?.from ?? '', to: e.target.value } }))}
                        className="h-7 rounded-md border border-input bg-transparent px-2"
                      >
                        <option value="">{t('to')}</option>
                        {wf.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        disabled={!pendingTrans?.from || !pendingTrans?.to || addTransition.isPending}
                        onClick={() => {
                          addTransition.mutate({ fromStatusId: pendingTrans!.from, toStatusId: pendingTrans!.to });
                          setNewTrans((p) => ({ ...p, [et]: { from: '', to: '' } }));
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {t('addTransition')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
