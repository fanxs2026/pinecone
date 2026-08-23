'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import { todoApi, type TodoItem, type WorkspaceMember } from '@/lib/api-client';
import { showToast } from '@/components/simple-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, CheckCircle2, Circle, Pencil, Trash2, Calendar, Clock, User } from 'lucide-react';

interface TodoListProps {
  workspaceId: string;
  ideaId: string;
  members: WorkspaceMember[];
}

export function TodoList({ workspaceId, ideaId, members }: TodoListProps) {
  const t = useTranslations('todo');
  const c = useTranslations('common');
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  // 新建表单状态
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');

  // 编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editDue, setEditDue] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['todos', workspaceId, ideaId] });
    // 同步失效页签角标计数（TO-DO 增删后角标实时更新）
    queryClient.invalidateQueries({ queryKey: ['todo-count', workspaceId, 'IDEA', ideaId] });
  };

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ['todos', workspaceId, ideaId],
    queryFn: () => todoApi.list(workspaceId, ideaId).then((r) => r.data),
    enabled: !!workspaceId && !!ideaId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      todoApi.create(workspaceId, ideaId, {
        title,
        description: description || undefined,
        assigneeId,
        dueDate: dueDate || undefined,
      }),
    onSuccess: () => {
      showToast(t('created'));
      setTitle(''); setDescription(''); setAssigneeId(''); setDueDate('');
      setShowForm(false);
      invalidate();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('createFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; title: string; description?: string; assigneeId?: string; dueDate?: string }) =>
      todoApi.update(workspaceId, ideaId, data.id, {
        title: data.title,
        description: data.description || undefined,
        assigneeId: data.assigneeId || undefined,
        dueDate: data.dueDate || undefined,
      }),
    onSuccess: () => {
      showToast(t('updated'));
      setEditingId(null);
      invalidate();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('updateFailed')),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      todoApi.setCompleted(workspaceId, ideaId, id, completed),
    onSuccess: () => {
      showToast(t('statusUpdated'));
      invalidate();
    },
    onError: (e: any) => showToast(e?.response?.data?.message || t('completeFailed')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => todoApi.remove(workspaceId, ideaId, id),
    onSuccess: () => {
      showToast(t('deleted'));
      invalidate();
    },
    onError: () => showToast(t('deleteFailed')),
  });

  const canOperate = (todo: TodoItem) =>
    currentUser && (todo.createdById === currentUser.id || todo.assigneeId === currentUser.id);

  const memberName = (id: string) =>
    members.find((m) => m.userId === id)?.user.name || members.find((m) => m.userId === id)?.user.email || '?';

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('zh-CN') : null;

  return (
    <Card className="border-0 shadow-none">
      <CardContent className="p-0">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            {t('count', { n: todos.filter((x) => !x.completedAt).length, total: todos.length })}
          </span>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {t('add')}
            </Button>
          )}
        </div>

        {/* 新建表单 */}
        {showForm && (
          <div className="mb-3 rounded-lg border p-3 space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
              autoFocus
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('descPlaceholder')}
            />
            <div className="flex gap-2">
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t('selectAssignee')}</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.user.name || m.user.email}</option>
                ))}
              </select>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 w-[150px]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setTitle(''); setDescription(''); setAssigneeId(''); setDueDate(''); }}>
                {c('cancel')}
              </Button>
              <Button
                size="sm"
                disabled={!title.trim() || !assigneeId || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? c('loading') : t('save')}
              </Button>
            </div>
          </div>
        )}

        {/* 列表 */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        ) : todos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <div className="space-y-2">
            {todos.map((todo) => {
              const completed = !!todo.completedAt;
              const editable = canOperate(todo);
              const isEditing = editingId === todo.id;
              return (
                <div key={todo.id} className={`rounded-lg border p-3 ${completed ? 'bg-muted/40' : ''}`}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} autoFocus />
                      <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={t('descPlaceholder')} />
                      <div className="flex gap-2">
                        <select
                          value={editAssignee}
                          onChange={(e) => setEditAssignee(e.target.value)}
                          className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>{m.user.name || m.user.email}</option>
                          ))}
                        </select>
                        <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="h-9 w-[150px]" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>{c('cancel')}</Button>
                        <Button
                          size="sm"
                          disabled={!editTitle.trim() || updateMutation.isPending}
                          onClick={() => updateMutation.mutate({
                            id: todo.id, title: editTitle,
                            description: editDesc, assigneeId: editAssignee, dueDate: editDue,
                          })}
                        >
                          {updateMutation.isPending ? c('loading') : c('save')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      {/* 完成勾选：仅创建人/负责人可点 */}
                      <button
                        onClick={() => canOperate(todo) && completeMutation.mutate({ id: todo.id, completed: !completed })}
                        disabled={!canOperate(todo) || completeMutation.isPending}
                        title={canOperate(todo) ? (completed ? t('uncomplete') : t('complete')) : t('noPermission')}
                        className="mt-0.5 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {completed
                          ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          : <Circle className="h-5 w-5 text-muted-foreground" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-sm font-medium ${completed ? 'text-muted-foreground line-through' : ''}`}>
                            {todo.title}
                          </span>
                          {editable && (
                            <div className="flex shrink-0 gap-1">
                              <button
                                onClick={() => {
                                  setEditingId(todo.id);
                                  setEditTitle(todo.title);
                                  setEditDesc(todo.description || '');
                                  setEditAssignee(todo.assigneeId);
                                  setEditDue(todo.dueDate ? todo.dueDate.slice(0, 10) : '');
                                }}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => todo.createdById === currentUser?.id && removeMutation.mutate(todo.id)}
                                disabled={todo.createdById !== currentUser?.id}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                                title={todo.createdById === currentUser?.id ? t('delete') : t('deleteCreatorOnly')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        {todo.description && <p className="mt-0.5 text-xs text-muted-foreground">{todo.description}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {memberName(todo.assigneeId)}
                          </span>
                          {todo.dueDate && (
                            <span className={`inline-flex items-center gap-1 ${isOverdue(todo) ? 'text-destructive' : ''}`}>
                              <Calendar className="h-3 w-3" />
                              {t('due')}: {fmtDate(todo.dueDate)}
                            </span>
                          )}
                          {completed && todo.completedAt && (
                            <span className="inline-flex items-center gap-1 text-emerald-600">
                              <Clock className="h-3 w-3" />
                              {t('completedAt')}: {fmtDate(todo.completedAt)}
                            </span>
                          )}
                          <Badge variant={completed ? 'secondary' : 'default'} className="text-[10px]">
                            {completed ? t('done') : t('pending')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function isOverdue(todo: TodoItem): boolean {
  return !!todo.dueDate && !todo.completedAt && new Date(todo.dueDate) < new Date();
}
