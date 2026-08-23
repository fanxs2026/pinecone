'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '@/hooks/use-workspace';
import { kbSpacesApi, kbPagesApi, kbTemplatesApi, type KbPage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TiptapEditor } from '@/components/kb/tiptap-editor';
import { showToast } from '@/components/simple-toast';
import { ArrowLeft, Plus, FilePlus2 } from 'lucide-react';

export default function NewPagePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const spaceId = params.spaceId as string;
  const parentId = searchParams.get('parentId') || undefined;
  const { workspaceId } = useWorkspace();
  const t = useTranslations('kb');
  const c = useTranslations('common');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState<any>(null);
  const [contentText, setContentText] = useState('');
  // 模板应用次数：key 变化强制 TiptapEditor 重建以加载模板内容
  const [editorKey, setEditorKey] = useState(0);

  // 模板列表（status=template 的页面）
  const { data: templatesData } = useQuery({
    queryKey: ['kb-templates', workspaceId],
    queryFn: () => kbTemplatesApi.list(workspaceId!).then((r) => r.data),
    enabled: !!workspaceId,
  });
  const templates: KbPage[] = templatesData || [];

  const applyTemplate = (tpl: KbPage) => {
    setTitle(tpl.title);
    if (tpl.content) setContent(tpl.content);
    if (tpl.contentText) setContentText(tpl.contentText);
    setEditorKey((k) => k + 1); // 强制编辑器重建，加载模板内容
    showToast(t('templatesUsed'));
  };

  const handleEditorChange = useCallback((json: any, text: string) => {
    setContent(json);
    setContentText(text);
  }, []);

  const createMutation = useMutation({
    mutationFn: () =>
      kbPagesApi.create(workspaceId!, {
        spaceId,
        parentId,
        title,
        content,
        contentText,
        status: 'draft',
      }),
    onSuccess: (res) => {
      // 失效页面树缓存，返回空间页时自动刷新显示新文档
      queryClient.invalidateQueries({ queryKey: ['kb-pages-tree', workspaceId, spaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-space', workspaceId, spaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-spaces', workspaceId] });
      router.push(`/kb/${spaceId}/${res.data.id}`);
    },
  });

  const { data: space, isLoading: spaceLoading } = useQuery({
    queryKey: ['kb-space', workspaceId, spaceId],
    queryFn: () => kbSpacesApi.get(workspaceId!, spaceId).then((r) => r.data),
    enabled: !!workspaceId,
  });

  // Load parent page title if creating a child page
  const { data: parentPage } = useQuery({
    queryKey: ['kb-page', workspaceId, parentId],
    queryFn: () => kbPagesApi.get(workspaceId!, parentId!).then((r) => r.data),
    enabled: !!workspaceId && !!parentId,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex items-center gap-4 border-b px-8 py-3">
        <button
          onClick={() => router.push(`/kb/${spaceId}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {c('back')}
        </button>
        <h1 className="text-lg font-semibold">
          {parentId && parentPage ? (
            <>{t('newChildPage')} · <span className="text-muted-foreground">{parentPage.title}</span></>
          ) : (
            <>{t('newPage')} · {space?.name || '...'}</>
          )}
        </h1>
        {templates.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <FilePlus2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('templatesTitle')}:</span>
            <select
              value=""
              onChange={(e) => {
                const tpl = templates.find((x) => x.id === e.target.value);
                if (tpl) applyTemplate(tpl);
              }}
              className="h-8 max-w-[220px] rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t('templates')}…</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="shrink-0 text-2xl font-bold h-auto py-2 border-none px-8 !ring-0 !ring-offset-0"
          placeholder={t('pageTitlePlaceholder')}
          autoFocus
        />
        <TiptapEditor
          key={editorKey}
          content={content}
          onChange={handleEditorChange}
          placeholder={t('editorPlaceholder')}
          className="flex-1"
        />
        <div className="flex shrink-0 items-center gap-2 border-t px-8 py-4">
          <Button type="submit" disabled={!title.trim() || createMutation.isPending}>
            <Plus className="mr-1.5 h-4 w-4" />
            {createMutation.isPending ? c('creating') : t('createPage')}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(`/kb/${spaceId}`)}>
            {c('cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
