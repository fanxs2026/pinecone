'use client';

import DateInput from '@/components/date-input';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntryApi, storyApi, workspaceApi, releaseApi } from '@/lib/api-client';
import { formatDate } from '@/lib/date-utils';
import { toHoursNumber } from '@/lib/number-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Plus, Trash2, ExternalLink, ListTree, Filter, X } from 'lucide-react';
import { useWorkspace } from '@/hooks/use-workspace';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { SubtaskDrawer, type SubtaskLike } from '@/components/subtask-drawer';

/** 工时可按实体类型筛选：任务用 storyId 关联，其余实体写 entityType（见后端 service） */
const ENTITY_TYPES = ['STORY', 'FEATURE', 'SUPPORT', 'IDEA', 'TEST_CASE'] as const;

export default function TimeTrackingPage() {
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();
  const tTime = useTranslations('timeTracking');
  const c = useTranslations('common');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  // 2026-11-27：列表筛选（此前后端只返回全量，页面没有任何过滤条件）
  const [filterReleaseId, setFilterReleaseId] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');

  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['time-entries', workspaceId, filterReleaseId, filterUserId, filterEntityType],
    queryFn: () =>
      timeEntryApi
        .list(workspaceId!, {
          releaseId: filterReleaseId || undefined,
          userId: filterUserId || undefined,
          entityType: filterEntityType || undefined,
        })
        .then((r) => r.data),
    enabled: !!workspaceId,
  });
  const entries = entriesData?.items ?? [];

  const { data: storiesData } = useQuery({
    queryKey: ['stories', workspaceId],
    queryFn: () => storyApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const stories = storiesData?.items ?? [];

  // 2026-08-14：子任务抽屉（工时记录点开子任务用）+ 成员列表（抽屉 owner 选择）
  const [editingSubtask, setEditingSubtask] = useState<SubtaskLike | null>(null);
  const { data: members } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: releasesData } = useQuery({
    queryKey: ['releases', workspaceId],
    queryFn: () => releaseApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const releases = releasesData?.items ?? [];

  /** 点开工时记录关联的 story：顶级 → 页签链接；子任务 → 拉完整数据开抽屉 */
  const openStory = async (storyId: string, parentId?: string | null) => {
    if (!parentId) return; // 顶级 story 走 Link 链接
    try {
      const r = await storyApi.get(workspaceId!, storyId);
      setEditingSubtask(r.data as SubtaskLike);
    } catch {
      setEditingSubtask(null);
    }
  };

  const createMutation = useMutation({
    mutationFn: () =>
      timeEntryApi.create(workspaceId!, {
        storyId: selectedStoryId,
        description,
        hours: parseFloat(hours),
        date,
      }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId] });
      setShowCreate(false);
      setSelectedStoryId('');
      setDescription('');
      setHours('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => timeEntryApi.remove(workspaceId!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId] }),
  });

  const totalHours = entries.reduce((sum, e) => sum + toHoursNumber(e.hours), 0);

  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Clock className="mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">{c('noWorkspaceYet')}</h2>
        <p className="mb-6 text-muted-foreground">{c('createWsFirst')}</p>
        <Button onClick={() => window.location.href = '/'}>{c('goCreateHome')}</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tTime('pageTitle')}</h1>
          <p className="text-muted-foreground">
            {tTime('total')}: <span className="font-semibold">{totalHours.toFixed(1)}h</span>
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1 h-4 w-4" /> {tTime('record')}
        </Button>
      </div>

      {/* 筛选：实体类型 + 发布周期 + 记录人（2026-11-27） */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterEntityType}
          onChange={(e) => setFilterEntityType(e.target.value)}
        >
          <option value="">{tTime('allEntityTypes')}</option>
          {ENTITY_TYPES.map((x) => (
            <option key={x} value={x}>
              {tTime(`et${x}`)}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterReleaseId}
          onChange={(e) => setFilterReleaseId(e.target.value)}
        >
          <option value="">{tTime('allReleases')}</option>
          {releases.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.version ? ` (${r.version})` : ''}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
        >
          <option value="">{tTime('allMembers')}</option>
          {(members ?? []).map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.user?.name || m.user?.email}
            </option>
          ))}
        </select>
        {(filterReleaseId || filterUserId || filterEntityType) && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterReleaseId('');
                setFilterUserId('');
                setFilterEntityType('');
              }}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              {tTime('clearFilter')}
            </Button>
            <span className="text-xs text-muted-foreground">
              {tTime('filteredTotal')}: {entries.length}
            </span>
          </>
        )}
      </div>

      {showCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">{tTime('record')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={selectedStoryId} onChange={(e) => setSelectedStoryId(e.target.value)}
            >
              <option value="">{tTime('selectStory')}</option>
              {stories.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <Input placeholder={tTime('workDescription')} value={description} onChange={(e) => setDescription(e.target.value)} />
            <div className="flex gap-2">
              <Input type="number" step="0.5" min="0" placeholder={tTime('hoursPlaceholder')} value={hours} onChange={(e) => setHours(e.target.value)} />
              <DateInput value={date} onChange={setDate} className="w-[170px]" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!selectedStoryId || !hours || !description}>
                {createMutation.isPending ? tTime('saving') : c('save')}
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{c('cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Clock className="h-12 w-12" />
          <p>{tTime('empty')}</p>
        </div>
      ) : (
        /* 2026-08-14：卡片 → 表格（紧凑，列：任务编号/标题/描述/工时/可计费/记录人/日期） */
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">{tTime('storyId')}</th>
                <th className="px-3 py-2 font-medium">{tTime('title')}</th>
                <th className="px-3 py-2 font-medium">{c('description')}</th>
                <th className="px-3 py-2 font-medium">{tTime('hours')}</th>
                <th className="px-3 py-2 font-medium">{tTime('billable')}</th>
                <th className="px-3 py-2 font-medium">{tTime('recorder')}</th>
                <th className="px-3 py-2 font-medium">{tTime('date')}</th>
                <th className="w-10 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="group border-b last:border-0 hover:bg-accent/40 transition-colors">
                  {/* Story ID（顶级→链接，子任务→抽屉；无 story 显示实体类型） */}
                  <td className="whitespace-nowrap px-3 py-2">
                    {entry.story ? (
                      entry.story.parentId ? (
                        <button
                          className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
                          onClick={() => openStory(entry.story!.id, entry.story!.parentId)}
                          title={entry.story.title}
                        >
                          <ListTree className="h-3 w-3" />
                          {entry.story.code || entry.story.id.slice(0, 8)}
                        </button>
                      ) : (
                        <Link
                          href={`/stories/${entry.story.id}`}
                          className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:underline"
                          title={entry.story.title}
                        >
                          {entry.story.code || entry.story.id.slice(0, 8)}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )
                    ) : entry.entity ? (
                      <span className="font-mono text-xs text-muted-foreground">{entry.entity.type}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* 标题（story 标题；无 story 显示实体标题） */}
                  <td className="max-w-56 truncate px-3 py-2">
                    {entry.story?.title || entry.entity?.label || '—'}
                  </td>
                  {/* 描述 */}
                  <td className="max-w-72 truncate px-3 py-2 text-muted-foreground">{entry.description}</td>
                  {/* 工时 */}
                  <td className="whitespace-nowrap px-3 py-2">
                    <Badge variant="secondary">{toHoursNumber(entry.hours)}h</Badge>
                  </td>
                  {/* 可计费 */}
                  <td className="whitespace-nowrap px-3 py-2">
                    {entry.billable ? (
                      <span className="text-xs text-green-600">{tTime('billable')}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* 记录人 */}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{entry.user?.name || '—'}</td>
                  {/* 日期 */}
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(entry.date)}</td>
                  {/* 删除（hover 显示） */}
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={() => deleteMutation.mutate(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 2026-08-14：子任务抽屉（从工时记录打开，与 story 详情页内一致） */}
      {editingSubtask && (
        <SubtaskDrawer
          subtask={editingSubtask}
          members={members ?? []}
          workspaceId={workspaceId!}
          onClose={() => setEditingSubtask(null)}
          onSave={(data) =>
            storyApi
              .update(workspaceId!, editingSubtask.id, data)
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId] });
                setEditingSubtask(null);
              })
          }
          onDelete={() => {
            storyApi.remove(workspaceId!, editingSubtask.id).then(() => {
              queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId] });
              setEditingSubtask(null);
            });
          }}
          onTimeLogged={() => queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId] })}
        />
      )}
    </div>
  );
}
