'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeEntryApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Loader2, X, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { showToast } from '@/components/simple-toast';

/**
 * 子任务编辑抽屉（2026-08-14 抽取为独立组件，供多处复用）：
 * - story 详情页子任务列表（subtasks-section）
 * - 工时菜单（time-tracking）：子任务工时记录点开
 * 右侧滑入/滑出（translate-x 过渡）；内容：标题/描述/负责人/状态 + 预计工作量 + 工时记录。
 */

export type SubtaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export const STATUS_CYCLE: SubtaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/** 子任务状态徽章配色（对齐系统 status-colors 风格） */
export const STATUS_STYLE: Record<SubtaskStatus, string> = {
  TODO: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
};

export interface SubtaskLike {
  id: string;
  title: string;
  status: string;
  description?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; email: string; name?: string } | null;
  code?: string | null;
  estimateHours?: number | null;
}

interface SubtaskDrawerProps {
  subtask: SubtaskLike;
  members: Array<{ user: { id: string; email: string; name?: string } }>;
  onClose: () => void;
  onSave: (data: Record<string, any>) => void;
  onDelete: () => void;
  workspaceId: string;
  onTimeLogged?: () => void;
}

export function SubtaskDrawer({
  subtask,
  members,
  onClose,
  onSave,
  onDelete,
  workspaceId,
  onTimeLogged,
}: SubtaskDrawerProps) {
  const t = useTranslations('subtask');
  const c = useTranslations('common');
  const [title, setTitle] = useState(subtask.title);
  const [description, setDescription] = useState(subtask.description || '');
  const [assigneeId, setAssigneeId] = useState(subtask.assigneeId || '');
  const [status, setStatus] = useState<SubtaskStatus>(
    STATUS_CYCLE.includes(subtask.status as SubtaskStatus) ? (subtask.status as SubtaskStatus) : 'TODO',
  );
  const [hours, setHours] = useState('');
  const [hoursDesc, setHoursDesc] = useState('');
  const [estimateHours, setEstimateHours] = useState<string>(
    subtask.estimateHours != null ? String(subtask.estimateHours) : '',
  );
  const [timeEntries, setTimeEntries] = useState<Array<{ id: string; hours: number | string; description?: string }>>([]);
  const [visible, setVisible] = useState(false); // 抽屉滑入/滑出动画状态
  const [closing, setClosing] = useState(false);
  const queryClient = useQueryClient();

  // 挂载后滑入（右侧 translate-x-full → 0）
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  /** 关闭：先滑出（300ms）再真正卸载 */
  const closeWithAnimation = () => {
    setClosing(true);
    setVisible(false);
    window.setTimeout(onClose, 300);
  };

  // 加载该子任务的工时记录（编辑时即时展示）
  const { data: entries } = useQuery({
    queryKey: ['time-entries', workspaceId, subtask.id],
    queryFn: () =>
      timeEntryApi.list(workspaceId!, { storyId: subtask.id }).then((r) => r.data.items),
    enabled: !!workspaceId && !!subtask.id,
  });

  const logTimeMutation = useMutation({
    mutationFn: () =>
      timeEntryApi
        .create(workspaceId!, {
          storyId: subtask.id,
          description: hoursDesc,
          hours: parseFloat(hours),
          date: new Date().toISOString().split('T')[0],
        })
        .then((r) => r.data),
    onSuccess: () => {
      setHours('');
      setHoursDesc('');
      queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId, subtask.id] });
      onTimeLogged?.();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || c('error')),
  });

  const list = (entries ?? timeEntries).filter(Boolean);
  const totalLogged = list.reduce((sum, e) => sum + Number((e as any).hours ?? 0), 0);
  const save = () => {
    const data: Record<string, any> = { title, status };
    if (description !== (subtask.description || '')) data.description = description || undefined;
    if (assigneeId !== (subtask.assigneeId || '')) data.assigneeId = assigneeId || null;
    // 预计工作量（小时）：空 → null，否则 Number
    const est = estimateHours.trim() === '' ? null : Number(estimateHours);
    if (est !== (subtask.estimateHours ?? null)) data.estimateHours = est;
    onSave(data);
  };

  return (
    <>
      {/* 遮罩（随抽屉淡入淡出） */}
      <div
        className={`fixed inset-0 z-40 bg-black/20 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={closeWithAnimation}
      />
      {/* 抽屉（右侧滑入/滑出：translate-x 过渡） */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-in-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{t('editTitle')}</h4>
            <Badge className={`${STATUS_STYLE[status]} border-0`}>
              {status === 'DONE' ? t('statusDone') : status === 'IN_PROGRESS' ? t('statusInProgress') : t('statusTodo')}
            </Badge>
            {subtask.code && <span className="text-xs text-muted-foreground">{subtask.code}</span>}
          </div>
          <button onClick={closeWithAnimation} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* 标题 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{c('title')}</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {/* 描述 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('noDescription')}
              className="min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </div>

          {/* 负责人 */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('owner')}</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">{t('unassigned')}</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name || m.user.email}
                </option>
              ))}
            </select>
          </div>

          {/* 状态（3 状态显式选择） */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('status')}</label>
            <div className="flex gap-2">
              {STATUS_CYCLE.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    status === s ? `${STATUS_STYLE[s]} border-transparent` : 'border-input text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {s === 'DONE' ? t('statusDone') : s === 'IN_PROGRESS' ? t('statusInProgress') : t('statusTodo')}
                </button>
              ))}
            </div>
          </div>

          {/* 预计工作量（小时） */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('estimatedHours')}</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                value={estimateHours}
                onChange={(e) => setEstimateHours(e.target.value)}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">{t('hoursUnit')}</span>
            </div>
          </div>

          {/* 工时记录 */}
          <div className="rounded-md border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t('logTime')}
              </label>
              <span className="text-xs text-muted-foreground">
                {t('loggedHours')}: <span className="font-medium">{totalLogged}h</span>
                {subtask.estimateHours != null && (
                  <span className="ml-1">/ {subtask.estimateHours}h</span>
                )}
              </span>
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder={t('hours')}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-24"
              />
              <Input
                placeholder={c('description')}
                value={hoursDesc}
                onChange={(e) => setHoursDesc(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                disabled={!hours || parseFloat(hours) <= 0 || logTimeMutation.isPending}
                onClick={() => logTimeMutation.mutate()}
              >
                {logTimeMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {list.length > 0 && (
              <ul className="mt-2 space-y-1">
                {list.map((e, i) => (
                  <li key={(e as any).id || i} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate">{(e as any).description || '—'}</span>
                    <span className="ml-2 shrink-0 font-medium">{Number((e as any).hours)}h</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between border-t px-5 py-3">
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {c('delete')}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={closeWithAnimation}>
              {c('cancel')}
            </Button>
            <Button size="sm" onClick={save}>
              {c('save')}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
