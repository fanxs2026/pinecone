'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storyApi, aiApi, workspaceApi } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HoursCompareBar } from '@/components/hours-compare-bar';
import { SubtaskDrawer, STATUS_CYCLE, STATUS_STYLE, type SubtaskStatus, type SubtaskLike } from '@/components/subtask-drawer';
import { Trash2, Plus, Loader2, Sparkles, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { showToast } from '@/components/simple-toast';
import { useAuthStore } from '@/stores/auth-store';

/**
 * 子任务增强版（2026-08-14）：
 * 子任务 = 挂 parentId 的子 Story（后端 Story 模型原生支持）。
 * 增强点：
 * 1. 3 状态（TODO / IN_PROGRESS / DONE）——点击状态徽章循环切换，替代原 checkbox
 * 2. assign owner（复用 workspace 成员列表）
 * 3. 工时：列表行显示累计工时；编辑抽屉内可记录工时（TimeEntry 按 storyId 绑定）
 * 4. 编辑抽屉：点击行 → 右侧抽屉拉出（编辑标题/描述/owner/状态 + 记录工时），关闭推回
 * 样式对齐系统（Aha muted pastel / 白底卡片 / 状态徽章配色走 status-colors）
 */

interface SubtasksSectionProps {
  workspaceId: string;
  storyId: string;
  featureId: string;
}

export function SubtasksSection({ workspaceId, storyId, featureId }: SubtasksSectionProps) {
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const t = useTranslations('subtask');
  const c = useTranslations('common');
  const user = useAuthStore((s) => s.user);

  const { data: subtasks, isLoading } = useQuery({
    queryKey: ['subtasks', workspaceId, storyId],
    queryFn: () =>
      storyApi
        .list(workspaceId!, { parentId: storyId, pageSize: 100 })
        .then((r) => r.data.items),
    enabled: !!workspaceId && !!storyId,
  });

  const { data: members } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const invalidateSubtasks = () => {
    queryClient.invalidateQueries({ queryKey: ['subtasks', workspaceId, storyId] });
    queryClient.invalidateQueries({ queryKey: ['stories', workspaceId] });
  };

  const createMutation = useMutation({
    mutationFn: ({ title, assigneeId }: { title: string; assigneeId: string }) =>
      storyApi
        .create(workspaceId!, { title, parentId: storyId, featureId, assigneeId: assigneeId || undefined })
        .then((r) => r.data),
    onSuccess: () => {
      invalidateSubtasks();
      setNewTitle('');
      setNewAssignee('');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message || c('error');
      showToast(typeof msg === 'string' ? msg : c('error'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, any>> }) =>
      storyApi.update(workspaceId!, id, data).then((r) => r.data),
    onSuccess: () => {
      invalidateSubtasks();
      showToast(t('saved'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || c('error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => storyApi.remove(workspaceId!, id),
    onSuccess: invalidateSubtasks,
  });

  /** 状态循环切换：TODO → IN_PROGRESS → DONE → TODO */
  const cycleStatus = (st: SubtaskLike, e: React.MouseEvent) => {
    e.stopPropagation();
    const s = st.status as SubtaskStatus;
    const cur = STATUS_CYCLE.includes(s) ? s : 'TODO';
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    updateMutation.mutate({ id: st.id, data: { status: next } });
  };

  // P2-⑪ AI 拆解：生成建议子任务（LLM 或本地启发式）
  const aiDecompose = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const r = await aiApi.decomposeStory(workspaceId!, storyId);
      setAiSuggestions(r.data.suggestions ?? []);
      if (r.data.suggestions.length === 0) showToast(t('aiEmpty'));
    } catch (e: any) {
      showToast(e?.response?.data?.message || t('aiError'));
    } finally {
      setAiLoading(false);
    }
  };

  const createAllMutation = useMutation({
    mutationFn: async (titles: string[]) => {
      for (const title of titles) {
        await storyApi.create(workspaceId!, { title, parentId: storyId, featureId });
      }
    },
    onSuccess: () => {
      invalidateSubtasks();
      setAiSuggestions(null);
      showToast(t('aiCreated'));
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('aiError')),
  });

  const doneCount = (subtasks ?? []).filter((s) => s.status === 'DONE').length;
  const total = (subtasks ?? []).length;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  const editing = editingId ? (subtasks ?? []).find((s) => s.id === editingId) : null;
  const memberName = (id?: string | null) => {
    if (!id) return t('unassigned');
    const m = members?.find((mm) => mm.user.id === id);
    return m?.user.name || m?.user.email || id;
  };

  return (
    <div className="space-y-3">
      {/* 2026-08-14 修复：详情页已有左侧"子任务"标签（t('subtasks')），此处不再重复标题；
          仅保留进度条（右对齐，随详情页标签行显示） */}
      {total > 0 && (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {doneCount}/{total}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {(subtasks ?? []).map((st) => (
            <div
              key={st.id}
              className="group flex cursor-pointer items-center gap-3 rounded-md border border-border/60 px-3 py-2 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
              onClick={() => setEditingId(st.id)}
            >
              {/* 列1：标题（flex-1，前移） */}
              <span
                className={`min-w-0 flex-1 truncate text-sm ${st.status === 'DONE' ? 'text-muted-foreground line-through' : ''}`}
              >
                {st.title}
              </span>
              {/* 列2：状态徽章（点击循环切换 3 状态；左对齐 + nowrap 不折行） */}
              <button
                title={t('status')}
                onClick={(e) => cycleStatus(st, e)}
                className="flex w-24 shrink-0 justify-start"
              >
                <Badge className={`${STATUS_STYLE[(STATUS_CYCLE.includes(st.status as SubtaskStatus) ? (st.status as SubtaskStatus) : 'TODO')]} border-0 whitespace-nowrap`}>
                  {st.status === 'DONE' ? t('statusDone') : st.status === 'IN_PROGRESS' ? t('statusInProgress') : t('statusTodo')}
                </Badge>
              </button>
              {/* 列3：Owner */}
              <span className="flex w-24 shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{memberName(st.assigneeId)}</span>
              </span>
              {/* 列4：子任务 story 号 */}
              <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">{st.code}</span>
              {/* 列5：工时比对条（蓝=预计 estimateHours，绿=实际 loggedHours） */}
              <span className="flex w-16 shrink-0 items-center">
                {(st.estimateHours != null && Number(st.estimateHours) > 0) ||
                (st.loggedHours != null && Number(st.loggedHours) > 0) ? (
                  <HoursCompareBar estimated={Number(st.estimateHours ?? 0)} logged={Number(st.loggedHours ?? 0)} />
                ) : null}
              </span>
              <button
                className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMutation.mutate(st.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {total === 0 && <p className="py-2 text-xs text-muted-foreground">{t('empty')}</p>}
        </div>
      )}

      {/* AI 拆解建议（保留原能力） */}
      {aiSuggestions ? (
        <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/40 p-3">
          <p className="text-xs font-medium text-violet-800">{t('aiSuggestTitle')}</p>
          <div className="space-y-1">
            {aiSuggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Plus className="h-3 w-3 shrink-0 text-violet-500" />
                <span className="flex-1">{s}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setAiSuggestions(null)} disabled={createAllMutation.isPending}>
              {c('cancel')}
            </Button>
            <Button size="sm" onClick={() => createAllMutation.mutate(aiSuggestions)} disabled={createAllMutation.isPending}>
              {createAllMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              {t('aiCreateAll', { count: aiSuggestions.length })}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={aiDecompose} disabled={aiLoading}>
            {aiLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5 text-violet-500" />
            )}
            {aiLoading ? t('aiLoading') : t('aiDecompose')}
          </Button>
        </div>
      )}

      {/* 创建：标题 + 可选 owner */}
      <div className="flex gap-2">
        <div className="flex flex-1 gap-2">
          <Input
            placeholder={t('placeholder')}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) {
                createMutation.mutate({ title: newTitle.trim(), assigneeId: newAssignee });
              }
            }}
          />
          <select
            className="h-9 w-32 shrink-0 rounded-md border border-input bg-transparent px-2 text-sm"
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
          >
            <option value="">{t('unassigned')}</option>
            {members?.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.name || m.user.email}
              </option>
            ))}
          </select>
        </div>
        <Button
          size="sm"
          disabled={!newTitle.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate({ title: newTitle.trim(), assigneeId: newAssignee })}
        >
          {createMutation.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          {t('add')}
        </Button>
      </div>

      {/* ── 编辑抽屉（右侧拉出，关闭推回）── */}
      {editing && (
        <SubtaskDrawer
          subtask={editing}
          members={members ?? []}
          onClose={() => setEditingId(null)}
          onSave={(data) => {
            updateMutation.mutate({ id: editing.id, data });
            setEditingId(null);
          }}
          onDelete={() => {
            deleteMutation.mutate(editing.id);
            setEditingId(null);
          }}
          workspaceId={workspaceId}
          onTimeLogged={() => {
            queryClient.invalidateQueries({ queryKey: ['time-entries', workspaceId, editing.id] });
            invalidateSubtasks();
          }}
        />
      )}
    </div>
  );
}
