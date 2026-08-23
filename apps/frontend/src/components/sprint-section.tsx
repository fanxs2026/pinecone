'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sprintsApi, releaseApi, type Sprint } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from 'next-intl';
import { GitBranch, Plus, Trash2, Loader2 } from 'lucide-react';
import { showToast } from '@/components/simple-toast';

/** 迭代管理（挂载在发布计划页；Sprint 可挂 Release，也可独立） */
export function SprintSection({ workspaceId }: { workspaceId: string | null }) {
  const t = useTranslations('sprintSection');
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [releaseId, setReleaseId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data: sprints, isLoading } = useQuery({
    queryKey: ['sprints', workspaceId],
    queryFn: () => sprintsApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sprints', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] });
  };

  const createSprint = useMutation({
    mutationFn: () =>
      sprintsApi
        .create(workspaceId!, {
          name: name.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          releaseId: releaseId || undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setName('');
      setStartDate('');
      setEndDate('');
      setReleaseId('');
      showToast(t('created'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const removeSprint = useMutation({
    mutationFn: (id: string) => sprintsApi.remove(workspaceId!, id),
    onSuccess: () => {
      invalidate();
      showToast(t('removed'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('error')),
  });

  const renameSprint = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      sprintsApi.update(workspaceId!, id, { name }).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      setEditingName('');
      showToast(t('renamed'));
    },
    onError: (e: any) => {
      showToast(e?.response?.data?.message || t('error'));
      setEditingId(null);
    },
  });

  const startRename = (sp: Sprint) => {
    setEditingId(sp.id);
    setEditingName(sp.name);
  };

  const commitRename = () => {
    if (editingId && editingName.trim() && editingName.trim() !== spNameOf(editingId)) {
      renameSprint.mutate({ id: editingId, name: editingName.trim() });
    } else {
      setEditingId(null);
    }
  };

  const spNameOf = (id: string) => sprints?.find((s) => s.id === id)?.name ?? '';

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            {t('title')}
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t('cancel') : (<><Plus className="mr-1 h-3.5 w-3.5" />{t('newSprint')}</>)}
          </Button>
        </CardTitle>
        <CardDescription>{t('desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <div className="grid grid-cols-2 gap-2 rounded-md border p-3 text-sm">
            <Input value={name} placeholder={t('namePh')} onChange={(e) => setName(e.target.value)} className="h-8 col-span-2" />
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-8" />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-8" />
            <select
              value={releaseId}
              onChange={(e) => setReleaseId(e.target.value)}
              className="col-span-2 h-8 rounded-md border border-input bg-transparent px-2"
            >
              <option value="">{t('noRelease')}</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ''}</option>
              ))}
            </select>
            <div className="col-span-2 flex justify-end">
              <Button size="sm" disabled={!name.trim() || createSprint.isPending} onClick={() => createSprint.mutate()}>
                {createSprint.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                {t('create')}
              </Button>
            </div>
          </div>
        )}

        {!sprints || sprints.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          sprints.map((sp: Sprint) => {
            const rel = releases.find((r) => r.id === sp.releaseId);
            const progress = (sp.storyCount ?? 0) > 0 ? Math.round(((sp.doneCount ?? 0) / (sp.storyCount ?? 1)) * 100) : 0;
            return (
              <div key={sp.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {editingId === sp.id ? (
                      <Input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="h-7 w-48 text-sm"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => startRename(sp)}
                        className="rounded px-1 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                        title={t('renameHint')}
                      >
                        {sp.name}
                      </button>
                    )}
                    {rel && <Badge variant="outline" className="text-[10px]">{rel.name}</Badge>}
                    <Badge variant="outline" className="text-[10px]">
                      {sp.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {sp.startDate ? new Date(sp.startDate).toLocaleDateString() : '?'} ~ {sp.endDate ? new Date(sp.endDate).toLocaleDateString() : '?'}
                    {' ｜ '}
                    {t('progress')}: {sp.doneCount ?? 0}/{sp.storyCount ?? 0} ({progress}%)
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeSprint.mutate(sp.id)} title={t('delete')}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
