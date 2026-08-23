'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { commentApi, workspaceApi, type WorkspaceMember } from '@/lib/api-client';
import { formatDateTime } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { RichCommentEditor } from '@/components/rich-comment-editor';
import { MessageSquare, Trash2, AtSign, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/stores/auth-store';
import DOMPurify from 'dompurify';

interface CommentSectionProps {
  workspaceId: string;
  entityType: 'IDEA' | 'FEATURE' | 'STORY' | 'SUPPORT';
  entityId: string;
}

/** 渲染富文本评论（@提及高亮 + DOMPurify 消毒 HTML） */
function CommentContent({ content }: { content: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(content || ''), [content]);
  if (!content) return null;
  return (
    <div
      className="prose prose-sm max-w-none text-sm text-foreground [&_a]:text-blue-600 [&_a]:underline
        [&_table]:w-full [&_table]:border-collapse [&_table]:my-2 [&_table]:text-xs
        [&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-2 [&_th]:py-1 [&_th]:font-medium
        [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top
        [&_img]:max-w-full [&_img]:rounded [&_img]:my-1
        [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li[data-type='taskItem']]:list-none [&_li[data-type='taskItem']_input]:mr-1.5"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export default function CommentSection({ workspaceId, entityType, entityId }: CommentSectionProps) {
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // 输入 @ 后的待选前缀
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('comment');
  const c = useTranslations('common');
  const user = useAuthStore((s) => s.user);

  // 成员（@提及建议用，惰性加载）
  const { data: members } = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => workspaceApi.members(workspaceId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null || !members?.length) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.userId !== user?.id &&
        ((m.user?.name ?? '').toLowerCase().includes(q) || (m.user?.email ?? '').toLowerCase().startsWith(q)),
    );
  }, [mentionQuery, members, user?.id]);

  const { data: commentsRes, isLoading } = useQuery({
    queryKey: ['comments', workspaceId, entityType, entityId],
    queryFn: () => commentApi.list(workspaceId, entityType, entityId).then((r) => r.data),
    enabled: !!workspaceId && !!entityId,
  });

  const comments = commentsRes?.items;

  const createMutation = useMutation({
    mutationFn: (content: string) =>
      commentApi.create(workspaceId, { entityType, entityId, content }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', workspaceId, entityType, entityId] });
      queryClient.invalidateQueries({ queryKey: ['comment-count', workspaceId, entityType, entityId] });
      setNewComment('');
      setError('');
    },
    onError: (err: unknown) => {
      const axiosErr = err as any;
      const detail = axiosErr?.response?.data
        ? typeof axiosErr.response.data === 'string'
          ? axiosErr.response.data
          : JSON.stringify(axiosErr.response.data)
        : (err as Error).message;
      setError(t('submitError', { detail }));
      console.error('Comment create error:', axiosErr?.response?.status, axiosErr?.response?.data || axiosErr.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => commentApi.remove(workspaceId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', workspaceId, entityType, entityId] });
      queryClient.invalidateQueries({ queryKey: ['comment-count', workspaceId, entityType, entityId] });
    },
  });

  // 编辑评论（仅作者本人）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      commentApi.update(workspaceId, id, content).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', workspaceId, entityType, entityId] });
      setEditingId(null);
      setEditingContent('');
    },
    onError: (err: unknown) => {
      const axiosErr = err as any;
      const detail = axiosErr?.response?.data?.message || (err as Error).message;
      setError(t('submitError', { detail: String(detail) }));
    },
  });

  const startEdit = (comment: { id: string; content: string }) => {
    setEditingId(comment.id);
    setEditingContent(comment.content);
    setError('');
  };

  const saveEdit = () => {
    if (editingId && editingContent.trim()) {
      updateMutation.mutate({ id: editingId, content: editingContent });
    } else {
      setEditingId(null);
    }
  };

  const initials = (name?: string, email?: string) =>
    (name?.charAt(0) ?? email?.charAt(0) ?? '?').toUpperCase();

  const handleEditorChange = (html: string, text: string) => {
    setNewComment(text.trim() ? html : '');
    // @提及检测：从纯文本最后一个 @ 触发
    const at = text.lastIndexOf('@');
    if (at >= 0) {
      const after = text.slice(at + 1);
      if (!/[\s，。；：！？，]/.test(after)) {
        setMentionQuery(after);
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (m: WorkspaceMember) => {
    // 纯文本提及注入：RichCommentEditor 通过受控 value 不便直接插入，改为提示手动输入
    const name = m.user?.name || m.user?.email?.split('@')[0] || '';
    if (inputRef.current) {
      inputRef.current.value = name;
    }
    setMentionQuery(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{t('listTitle', { count: comments?.length ?? 0 })}</h3>
      </div>

      {/* Add comment */}
      <div className="relative space-y-2">
        <RichCommentEditor value={newComment} onChange={handleEditorChange} />
        {mentionSuggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-56 overflow-hidden rounded-md border border-border bg-white shadow-xl">
            {mentionSuggestions.slice(0, 6).map((m) => (
              <button
                key={m.userId}
                onClick={() => insertMention(m)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <AtSign className="h-3 w-3 text-muted-foreground" />
                <span className="flex-1 truncate">{m.user?.name || m.user?.email}</span>
                <span className="truncate text-xs text-muted-foreground">{m.user?.email}</span>
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => createMutation.mutate(newComment)}
            disabled={!newComment || createMutation.isPending}
          >
            {createMutation.isPending ? t('submitting') : c('submit')}
          </Button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : comments?.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          comments?.map((comment) => (
            <div key={comment.id} className="group flex gap-3 rounded-lg border p-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {initials(comment.user?.name, comment.user?.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {comment.user?.name || comment.user?.email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(comment.createdAt)}
                    </span>
                    {comment.updatedAt && comment.updatedAt !== comment.createdAt && (
                      <span className="text-[10px] text-muted-foreground/70">{t('edited')}</span>
                    )}
                  </div>
                  {comment.userId === user?.id && editingId !== comment.id && (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => startEdit(comment)}
                        title={t('edit')}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => deleteMutation.mutate(comment.id)}
                        title={t('delete')}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>
                {editingId === comment.id ? (
                  <div className="space-y-2">
                    <RichCommentEditor
                      value={editingContent}
                      onChange={(html, text) => {
                        setEditingContent(text.trim() ? html : '');
                      }}
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        {c('cancel')}
                      </Button>
                      <Button
                        size="sm"
                        onClick={saveEdit}
                        disabled={!editingContent.trim() || updateMutation.isPending}
                      >
                        {updateMutation.isPending ? t('submitting') : c('save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <CommentContent content={comment.content} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
