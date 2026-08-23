'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kbPagesApi, kbCommentsApi, kbTagsApi, kbExportApi, uploadApi, type KbComment, type KbTag, type Attachment, type KbPageLink, type EntitySearchItem } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TiptapEditor } from '@/components/kb/tiptap-editor';
import { showToast } from '@/components/simple-toast';
import { PageTree } from '@/components/kb/page-tree';
import {
  ArrowLeft, Pencil, Save, X,
  MessageSquare, Send, Trash2, Plus,
  Download, Printer, Paperclip, Upload,
  Globe, Lock, Shield, FolderInput, FileText, History, Link2, Search, ChevronRight, RotateCcw,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useWorkspace } from '@/hooks/use-workspace';

export default function PageDetailPage() {
  const params = useParams();
  const router = useRouter();
  const spaceId = params.spaceId as string;
  const pageId = params.pageId as string;
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const t = useTranslations('kb');
  const c = useTranslations('common');
  const tStatus = useTranslations('status');

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState<any>(null);
  const [editContentText, setEditContentText] = useState('');
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  // G1 P1-B 页面权限（编辑态）
  const [editVisibility, setEditVisibility] = useState('SPACE');
  const [editAllowedRoles, setEditAllowedRoles] = useState<string[]>([]);
  // G1 P2-A 历史面板
  const [showHistory, setShowHistory] = useState(false);
  // G1 P1-A 关联工作项（类型 + 搜索）
  const [linkType, setLinkType] = useState('STORY');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<EntitySearchItem[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);

  const ROLE_OPTIONS = ['VIEWER', 'MEMBER', 'ADMIN'];
  const ENTITY_TYPE_OPTIONS = ['IDEA', 'FEATURE', 'STORY', 'SUPPORT', 'RELEASE', 'TEST_CASE'];

  const toggleRole = (r: string) =>
    setEditAllowedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const handleEditorChange = useCallback((json: any, text: string) => {
    setEditContent(json);
    setEditContentText(text);
  }, []);

  const { data: page, isLoading } = useQuery({
    queryKey: ['kb-page', workspaceId, pageId],
    queryFn: () => kbPagesApi.get(workspaceId!, pageId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const { data: treePages = [] } = useQuery({
    queryKey: ['kb-pages-tree', workspaceId, spaceId],
    queryFn: () => kbPagesApi.tree(workspaceId!, spaceId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // 移动页面到其他父级（扁平化候选列表，排除自身）
  const moveMutation = useMutation({
    mutationFn: (targetParentId: string | null) =>
      kbPagesApi.move(workspaceId!, pageId, { parentId: targetParentId }),
    onSuccess: () => {
      showToast(t('moveDone'));
      queryClient.invalidateQueries({ queryKey: ['kb-pages-tree', workspaceId, spaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-page', workspaceId, pageId] });
    },
    onError: () => showToast(t('moveFailed')),
  });
  const moveCandidates = useMemo(() => {
    const flatten = (nodes: any[], depth: number): { id: string; label: string }[] => {
      let out: { id: string; label: string }[] = [];
      for (const n of nodes) {
        // 排除当前页面及其整棵子树（防止移动到自身/子孙造成循环引用）
        if (n.id === pageId) continue;
        out.push({ id: n.id, label: `${'　'.repeat(depth)}${n.title}` });
        if (n.children?.length) out = out.concat(flatten(n.children, depth + 1));
      }
      return out;
    };
    return flatten(treePages || [], 0);
  }, [treePages, pageId]);

  const { data: commentsData, refetch: refetchComments } = useQuery({
    queryKey: ['kb-comments', workspaceId, pageId],
    queryFn: () => kbCommentsApi.list(workspaceId!, pageId).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const comments = commentsData?.items || [];

  const { data: attachments = [] } = useQuery({
    queryKey: ['kb-attachments', workspaceId, pageId],
    queryFn: () => uploadApi.list(workspaceId!, 'KbPage', pageId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      kbPagesApi.update(workspaceId!, pageId, {
        title: editTitle || page?.title,
        content: editContent,
        contentText: editContentText,
        visibility: editVisibility,
        allowedRoleIds: editAllowedRoles,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-page', workspaceId, pageId] });
      queryClient.invalidateQueries({ queryKey: ['kb-pages-tree', workspaceId, spaceId] });
      setEditing(false);
    },
  });

  // G1 P1-A：页面关联的工作项
  const { data: pageLinks = [], refetch: refetchLinks } = useQuery({
    queryKey: ['kb-page-links', workspaceId, pageId],
    queryFn: () => kbPagesApi.links(workspaceId!, pageId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // G1 P2-A：版本历史
  const { data: versions = [], refetch: refetchVersions } = useQuery({
    queryKey: ['kb-page-versions', workspaceId, pageId],
    queryFn: () => kbPagesApi.versions(workspaceId!, pageId).then((r) => r.data),
    enabled: !!workspaceId && showHistory,
  });

  const linkMutation = useMutation({
    mutationFn: (entityId: string) =>
      kbPagesApi.linkEntity(workspaceId!, pageId, { entityType: linkType, entityId }),
    onSuccess: () => {
      showToast(t('linked'));
      refetchLinks();
    },
    onError: () => showToast(t('linkFailed')),
  });

  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => kbPagesApi.removeLink(workspaceId!, pageId, linkId),
    onSuccess: () => {
      refetchLinks();
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (version: number) => kbPagesApi.rollback(workspaceId!, pageId, version),
    onSuccess: () => {
      showToast(t('rolledBack'));
      setShowHistory(false);
      queryClient.invalidateQueries({ queryKey: ['kb-page', workspaceId, pageId] });
      queryClient.invalidateQueries({ queryKey: ['kb-page-versions', workspaceId, pageId] });
    },
  });

  const searchEntities = async () => {
    setLinkSearching(true);
    try {
      const res = await kbPagesApi.searchEntities(workspaceId!, linkType, linkQuery || undefined);
      setLinkResults(res.data);
    } finally {
      setLinkSearching(false);
    }
  };

  const publishMutation = useMutation({
    mutationFn: () =>
      kbPagesApi.update(workspaceId!, pageId, { status: 'published' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-page', workspaceId, pageId] });
      queryClient.invalidateQueries({ queryKey: ['kb-pages-tree', workspaceId, spaceId] });
    },
  });

  // 设为/取消模板（模板页会在"从模板创建"时出现）
  const templateMutation = useMutation({
    mutationFn: (isTemplate: boolean) =>
      kbPagesApi.update(workspaceId!, pageId, { status: isTemplate ? 'template' : 'draft' }),
    onSuccess: () => {
      showToast(t('templateSet'));
      queryClient.invalidateQueries({ queryKey: ['kb-page', workspaceId, pageId] });
      queryClient.invalidateQueries({ queryKey: ['kb-pages-tree', workspaceId, spaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-templates', workspaceId] });
    },
    onError: () => showToast(t('templateSetFailed')),
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      kbCommentsApi.create(workspaceId!, { pageId, body: newComment, parentId: replyTo || undefined }),
    onSuccess: () => {
      refetchComments();
      setNewComment('');
      setReplyTo(null);
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => kbCommentsApi.remove(workspaceId!, commentId),
    onSuccess: () => refetchComments(),
  });

  const handleExport = async () => {
    try {
      const res = await kbExportApi.export(workspaceId!, pageId, 'markdown');
      const { filename, content } = res.data;
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadApi.upload(workspaceId!, 'KbPage', pageId, file);
      queryClient.invalidateQueries({ queryKey: ['kb-attachments', workspaceId, pageId] });
    } catch { /* ignore */ }
    e.target.value = '';
  };

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attId: string) => uploadApi.remove(workspaceId!, attId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-attachments', workspaceId, pageId] });
    },
  });

  const startEdit = () => {
    if (!page) return;
    setEditTitle(page.title);
    setEditContent(page.content || null);
    setEditContentText(page.contentText || '');
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <p className="text-muted-foreground">Page not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left: page tree */}
      <PageTree
        spaceId={spaceId}
        workspaceId={workspaceId!}
        pages={treePages}
        selectedPageId={pageId}
        onNewPage={() => router.push(`/kb/${spaceId}/new`)}
      />

      {/* Right: content */}
      <div className="flex flex-1 flex-col min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-8 py-3">
        <button
          onClick={() => router.push(`/kb/${spaceId}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {c('back')}
        </button>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => router.push(`/kb/${spaceId}/new?parentId=${pageId}`)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('childPage')}
              </Button>
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                {c('edit')}
              </Button>
              {page.status === 'draft' && (
                <Button size="sm" variant="default" onClick={() => publishMutation.mutate()}>
                  {c('publish')}
                </Button>
              )}
              {page.status === 'template' ? (
                <Button size="sm" variant="outline" onClick={() => templateMutation.mutate(false)}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {t('cancelTemplate')}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => templateMutation.mutate(true)} disabled={templateMutation.isPending}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {t('setTemplate')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)} title={t('history')}>
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
              </Button>
              <div className="flex items-center gap-1">
                <FolderInput className="h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value=""
                  disabled={moveMutation.isPending}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__root__') moveMutation.mutate(null);
                    else if (v) moveMutation.mutate(v);
                  }}
                  className="h-8 max-w-[160px] rounded-md border border-input bg-background px-1.5 text-xs"
                  title={t('movePage')}
                >
                  <option value="">{t('movePage')}</option>
                  <option value="__root__">{t('moveRoot')}</option>
                  {moveCandidates.map((cand) => (
                    <option key={cand.id} value={cand.id}>{cand.label}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {updateMutation.isPending ? t('saving') : c('save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                {c('cancel')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {editing ? (
          <div className="flex h-full flex-col">
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="shrink-0 text-2xl font-bold h-auto py-2 border-none px-6 !ring-0 !ring-offset-0"
              placeholder={t('pageTitlePlaceholder')}
            />
            {/* G1 P1-B：页面权限控件（编辑态） */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-1.5 text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> {t('visibility')}
              </span>
              <select
                value={editVisibility}
                onChange={(e) => setEditVisibility(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="SPACE">{t('visSpace')}</option>
                <option value="PRIVATE">{t('visPrivate')}</option>
              </select>
              {editVisibility === 'PRIVATE' && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleRole(r)}
                      className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        editAllowedRoles.includes(r)
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                          : 'bg-black/5 text-muted-foreground'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <TiptapEditor
              // V 修复（2026-08-19）：按 pageId 加 key——切换页面时整体重挂，
              // Yjs provider/文档随卸载销毁、随挂载重建（避免旧 pageId 的协同残留）
              key={pageId}
              content={editContent}
              onChange={handleEditorChange}
              placeholder={t('editorPlaceholder')}
              className="flex-1"
              collab={{ pageId }}
            />
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-bold">{page.title}</h1>
            <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
              <span>{page.author?.name || page.author?.email}</span>
              <span>·</span>
              <span>{new Date(page.updatedAt).toLocaleDateString('zh-CN')}</span>
              <span>·</span>
              <span>v{page.version}</span>
              {page.visibility === 'PRIVATE' && (
                <span className="flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" title={(page.allowedRoleIds ?? []).join(', ')}>
                  <Lock className="h-3 w-3" /> {t('visPrivate')}
                </span>
              )}
              {page.status && (
                <span className={`rounded px-1.5 py-0.5 text-xs ${
                  page.status === 'published'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                }`}>
                  {page.status === 'published'
                    ? tStatus('KB_PUBLISHED')
                    : page.status === 'draft'
                      ? tStatus('KB_DRAFT')
                      : page.status}
                </span>
              )}
            </div>
            <div className="prose prose-sm mt-8 max-w-none dark:prose-invert">
              {page.content ? (
                <TiptapEditor content={page.content} editable={false} />
              ) : (
                <p className="italic text-muted-foreground">{t('noContent')}</p>
              )}
            </div>

            {/* G1 P1-A：关联工作项区 */}
            <div className="mt-8 rounded-lg border p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Link2 className="h-4 w-4" />
                {t('linkedItems')}
              </h2>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <select
                  value={linkType}
                  onChange={(e) => { setLinkType(e.target.value); setLinkResults([]); }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {ENTITY_TYPE_OPTIONS.map((et) => (
                    <option key={et} value={et}>{et}</option>
                  ))}
                </select>
                <Input
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchEntities()}
                  placeholder={t('linkSearchPlaceholder')}
                  className="h-8 w-64 text-xs"
                />
                <Button size="sm" variant="outline" onClick={searchEntities} disabled={linkSearching}>
                  <Search className="mr-1 h-3.5 w-3.5" /> {t('search')}
                </Button>
              </div>
              {linkResults.length > 0 && (
                <div className="mb-3 space-y-1 rounded-md border bg-muted/30 p-2">
                  {linkResults.map((it) => (
                    <div key={it.id} className="flex items-center justify-between gap-2 px-1 py-0.5 text-xs">
                      <span className="truncate">{it.code ? `${it.code} · ` : ''}{it.title}</span>
                      <Button size="sm" variant="outline" onClick={() => linkMutation.mutate(it.id)}>
                        <Plus className="mr-0.5 h-3 w-3" /> {t('link')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                {pageLinks.map((l: KbPageLink) => (
                  <div key={l.id} className="group flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-xs">
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium">{l.entityType}</span>
                    <span className="flex-1 truncate">{l.entityTitle ?? l.entityId}</span>
                    <button
                      onClick={() => unlinkMutation.mutate(l.id)}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      title={t('removeLink')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {pageLinks.length === 0 && (
                  <p className="text-xs text-muted-foreground">{t('noLinks')}</p>
                )}
              </div>
            </div>

            {/* G1 P2-A：历史版本面板 */}
            {showHistory && (
              <div className="mt-6 rounded-lg border p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4" />
                  {t('history')}
                </h2>
                <div className="space-y-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-xs">
                      <span className="w-14 shrink-0 font-medium">v{v.version}</span>
                      <span className="flex-1 truncate text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString('zh-CN')} · {v.editor?.name || v.editor?.email || '-'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rollbackMutation.isPending}
                        onClick={() => rollbackMutation.mutate(v.version)}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> {t('rollback')}
                      </Button>
                    </div>
                  ))}
                  {versions.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('noVersions')}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Attachments section */}
        {!editing && (
          <div className="mt-10 border-t pt-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Paperclip className="h-4 w-4" />
              {t('attachmentsCount', { count: attachments.length })}
            </h2>
            <div className="space-y-2">
              {attachments.map((att: Attachment) => (
                <div key={att.id} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{att.fileName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {att.fileSize > 1024 ? `${(att.fileSize / 1024).toFixed(1)} KB` : `${att.fileSize} B`}
                  </span>
                  {/* Only the uploader sees the delete button (backend enforces uploader-or-admin) */}
                  {att.uploadedBy.id === user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      title={c('delete')}
                      onClick={() => deleteAttachmentMutation.mutate(att.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <Upload className="h-3.5 w-3.5" />
              <span>{t('uploadFile')}</span>
              <input type="file" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}

        {/* Comments section */}
        {!editing && (
          <div className="mt-12 border-t pt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <MessageSquare className="h-5 w-5" />
              {t('commentsCount', { count: comments.length })}
            </h2>

            {/* Comment list */}
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noComments')}</p>
            ) : (
              <div className="space-y-3">
                {buildCommentTree(comments).map((root) => (
                  <CommentThread
                    key={root.id}
                    comment={root as any}
                    user={user}
                    deleteCommentMutation={deleteCommentMutation}
                    replyTo={replyTo}
                    setReplyTo={setReplyTo}
                    newComment={newComment}
                    setNewComment={setNewComment}
                    commentMutation={commentMutation}
                    depth={0}
                  />
                ))}
              </div>
            )}

            {/* Comment form */}
            <div className="mt-4">
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t('replying')}</span>
                  <button
                    onClick={() => { setReplyTo(null); setNewComment(''); }}
                    className="text-primary hover:underline"
                  >
                    {t('cancelReply')}
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={replyTo ? t('replyPlaceholder') : t('commentPlaceholder')}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (newComment.trim()) commentMutation.mutate();
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => commentMutation.mutate()}
                  disabled={!newComment.trim() || commentMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}

// ── Threaded comment helpers ──

function buildCommentTree(comments: KbComment[]): KbComment[] {
  const childrenOf = new Map<string, KbComment[]>();
  const roots: KbComment[] = [];

  for (const c of comments) {
    if (c.parentId) {
      const list = childrenOf.get(c.parentId) || [];
      list.push(c);
      childrenOf.set(c.parentId, list);
    } else {
      roots.push(c);
    }
  }
  // Attach children for easy access in rendering
  for (const c of comments) {
    (c as any)._children = childrenOf.get(c.id) || [];
  }
  return roots;
}

function CommentThread({
  comment, user, deleteCommentMutation,
  replyTo, setReplyTo, newComment, setNewComment, commentMutation, depth,
}: {
  comment: KbComment & { _children: KbComment[] };
  user: any;
  deleteCommentMutation: any;
  replyTo: string | null;
  setReplyTo: (id: string | null) => void;
  newComment: string;
  setNewComment: (v: string) => void;
  commentMutation: any;
  depth: number;
}) {
  const t = useTranslations('kb');
  const c = useTranslations('common');
  const children = (comment as any)._children as KbComment[];
  return (
    <div className="rounded-lg border bg-card p-4" style={{ marginLeft: depth > 0 ? `${Math.min(depth * 20, 60)}px` : undefined }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {comment.author?.name || comment.author?.email}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(comment.createdAt).toLocaleDateString('zh-CN')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {replyTo !== comment.id && (
            <button
              onClick={() => { setReplyTo(comment.id); setNewComment(''); }}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              {t('reply')}
            </button>
          )}
          {comment.authorId === user?.id && (
            <button
              onClick={() => {
                if (window.confirm(t('confirmDeleteComment'))) {
                  deleteCommentMutation.mutate(comment.id);
                }
              }}
              className="text-muted-foreground hover:text-destructive"
              title={c('delete')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm whitespace-pre-wrap">{comment.body}</p>

      {children.length > 0 && (
        <div className="mt-3 space-y-2">
          {children.map((child) => (
            <CommentThread
              key={child.id}
              comment={child as any}
              user={user}
              deleteCommentMutation={deleteCommentMutation}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              newComment={newComment}
              setNewComment={setNewComment}
              commentMutation={commentMutation}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
